import {
  Alert,
  Badge,
  Button,
  Descriptions,
  Form,
  Input,
  Space,
  Tag,
  Typography,
  Upload,
  message
} from "antd";
import { InboxOutlined, CheckCircleTwoTone, EditOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import dayjs from "dayjs";

import styles from "./IntervieweeView.module.css";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { selectActiveProfile, selectActiveSession, selectResumeParseStatus } from "../../store/selectors";
import { ingestResume, resetSession, beginInterview, submitAnswer } from "../../store/thunks/sessionThunks";
import { setSessionStage, updateProfileField, updateTimerState } from "../../store/slices/sessionSlice";
import type {
  InterviewQuestion,
  QuestionTimerState,
  RequiredProfileField,
  SessionStage
} from "../../types/interview";

const { Title, Text } = Typography;

const ACCEPTED_TYPES = ".pdf,.docx";

export const IntervieweeView = () => {
  const dispatch = useAppDispatch();
  const resumeParse = useAppSelector(selectResumeParseStatus);
  const activeProfile = useAppSelector(selectActiveProfile);
  const activeSession = useAppSelector(selectActiveSession);

  const [form] = Form.useForm();

  const stage: SessionStage = activeSession?.stage ?? "resume-upload";
  const hasInterviewBegun = stage === "questioning" || stage === "completed" || stage === "paused";
  const missingFields = activeProfile?.missingFields ?? [];
  const isParsing = resumeParse.status === "parsing";

  const [answerDraft, setAnswerDraft] = useState("");
  const [isStartingInterview, setIsStartingInterview] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const currentQuestionId = activeSession?.currentQuestionId ?? null;
  const currentQuestion: InterviewQuestion | null = currentQuestionId
    ? activeSession?.questions[currentQuestionId] ?? null
    : null;
  const currentTimer: QuestionTimerState | null = currentQuestionId
    ? activeSession?.timers[currentQuestionId] ?? null
    : null;
  const answeredCount = activeSession ? Object.keys(activeSession.answers).length : 0;
  const totalQuestions = activeSession ? activeSession.questionOrder.length : 0;
  const currentQuestionIndex = currentQuestionId && activeSession
    ? activeSession.questionOrder.indexOf(currentQuestionId)
    : -1;
  const shouldShowProfileEditor = isEditingProfile || missingFields.length > 0;
  const showEditButton = missingFields.length === 0;

  const timerRef = useRef<QuestionTimerState | null>(currentTimer);
  const autoSubmittedRef = useRef<string | null>(null);

  const formatSeconds = useCallback((value: number) => {
    const safeValue = Math.max(0, value);
    const minutes = Math.floor(safeValue / 60);
    const seconds = safeValue % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: ACCEPTED_TYPES,
      multiple: false,
      showUploadList: false,
      beforeUpload: (file: File) => {
        dispatch(ingestResume({ file }));
        return false;
      },
      disabled: isParsing
    }),
    [dispatch, isParsing]
  );

  useEffect(() => {
    if (activeProfile) {
      form.setFieldsValue({
        name: activeProfile.name ?? "",
        email: activeProfile.email ?? "",
        phone: activeProfile.phone ?? ""
      });
    } else {
      form.resetFields();
    }
  }, [activeProfile, form]);

  useEffect(() => {
    if (activeSession && activeSession.stage === "profile-completion" && missingFields.length === 0) {
      dispatch(setSessionStage("ready-to-start"));
    }
  }, [activeSession, missingFields, dispatch]);

  useEffect(() => {
    timerRef.current = currentTimer;
  }, [currentTimer]);

  useEffect(() => {
    setAnswerDraft("");
    autoSubmittedRef.current = null;
  }, [currentQuestionId]);

  useEffect(() => {
    if (missingFields.length > 0) {
      setIsEditingProfile(true);
    }
  }, [missingFields.length]);

  useEffect(() => {
    if (!currentQuestionId || !currentTimer?.isRunning) {
      return;
    }

    timerRef.current = currentTimer;

    const intervalId = window.setInterval(() => {
      const latest = timerRef.current;
      if (!latest || !latest.isRunning) {
        return;
      }

      const now = dayjs();
      const lastTickSource = latest.lastTickAt ?? latest.startedAt;
      const lastTick = lastTickSource ? dayjs(lastTickSource) : now;
      const elapsedSeconds = Math.max(1, now.diff(lastTick, "second"));

      if (elapsedSeconds <= 0) {
        return;
      }

      const nextRemaining = Math.max(0, latest.remainingSeconds - elapsedSeconds);
      const updatedTimer: QuestionTimerState = {
        ...latest,
        remainingSeconds: nextRemaining,
        lastTickAt: now.toISOString(),
        isRunning: nextRemaining > 0
      };

      timerRef.current = updatedTimer;
      dispatch(updateTimerState(updatedTimer));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [currentQuestionId, currentTimer, dispatch]);

  const handleProfileFieldChange = useCallback(
    (field: RequiredProfileField, value: string) => {
      dispatch(updateProfileField({ field, value }));
    },
    [dispatch]
  );

  const handleReset = () => {
    dispatch(resetSession());
  };

  const handleToggleProfileEditing = useCallback(() => {
    setIsEditingProfile((prev) => {
      const next = !prev;
      if (!next && activeProfile) {
        form.setFieldsValue({
          name: activeProfile.name ?? "",
          email: activeProfile.email ?? "",
          phone: activeProfile.phone ?? ""
        });
      }
      return next;
    });
  }, [activeProfile, form]);

  const handleStartInterview = useCallback(async () => {
    if (isStartingInterview || !activeSession) {
      return;
    }

    setIsStartingInterview(true);
    try {
      await dispatch(beginInterview()).unwrap();
    } catch (error) {
      const errorMessage = typeof error === "string" ? error : "Unable to start the interview.";
      message.error(errorMessage);
    } finally {
      setIsStartingInterview(false);
    }
  }, [activeSession, dispatch, isStartingInterview]);

  const handleSubmitAnswer = useCallback(
    async (autoSubmit = false) => {
      if (!currentQuestionId || stage !== "questioning") {
        return;
      }

      if (!autoSubmit && !answerDraft.trim()) {
        message.warning("Please add a response before submitting.");
        return;
      }

      if (isSubmittingAnswer) {
        return;
      }

      setIsSubmittingAnswer(true);
      try {
        await dispatch(
          submitAnswer({
            answer: answerDraft,
            autoSubmitted: autoSubmit
          })
        ).unwrap();
        setAnswerDraft("");
        autoSubmittedRef.current = null;
      } catch (error) {
        const errorMessage = typeof error === "string" ? error : "Failed to submit your answer.";
        message.error(errorMessage);
        if (autoSubmit) {
          autoSubmittedRef.current = null;
        }
      } finally {
        setIsSubmittingAnswer(false);
      }
    },
    [answerDraft, currentQuestionId, dispatch, isSubmittingAnswer, stage]
  );

  const handleEditorEnter = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        void handleSubmitAnswer(false);
      }
    },
    [handleSubmitAnswer]
  );

  useEffect(() => {
    if (!currentQuestionId || !currentTimer) {
      return;
    }

    const alreadyAnswered = Boolean(activeSession?.answers[currentQuestionId]);

    if (
      currentTimer.remainingSeconds <= 0 &&
      !currentTimer.isRunning &&
      !alreadyAnswered &&
      autoSubmittedRef.current !== currentQuestionId
    ) {
      autoSubmittedRef.current = currentQuestionId;
      void handleSubmitAnswer(true);
    }
  }, [activeSession?.answers, currentQuestionId, currentTimer, handleSubmitAnswer]);

  const renderInterviewPanel = () => {
    if (!activeSession || (stage !== "questioning" && stage !== "completed")) {
      return null;
    }

    const answeredLabel = `${answeredCount}/${totalQuestions || 1} answered`;
    const timerRemaining = currentTimer ? formatSeconds(currentTimer.remainingSeconds) : "00:00";
    const timerCritical = (currentTimer?.remainingSeconds ?? 0) <= 10;

    return (
      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <Title level={4} className={styles.sectionTitle}>
            Interview
          </Title>
          <Space size="small" wrap>
            <Tag color="blue">{answeredLabel}</Tag>
            {stage === "questioning" && currentQuestion && currentQuestionIndex >= 0 && (
              <Tag
                color={
                  currentQuestion.difficulty === "hard"
                    ? "magenta"
                    : currentQuestion.difficulty === "medium"
                    ? "geekblue"
                    : "green"
                }
              >
                Question {currentQuestionIndex + 1} of {totalQuestions || 1}
              </Tag>
            )}
            {stage === "completed" && <Tag color="green">Completed</Tag>}
          </Space>
        </div>

        {stage === "questioning" && (
          <Alert
            type="info"
            showIcon
            message="Focus on the current prompt."
            description="Previous answers and AI feedback stay hidden during the live interview."
          />
        )}

        {stage === "questioning" && currentQuestion && (
          <div className={styles.questionCard}>
            <div className={styles.questionHeader}>
              <Text strong>{currentQuestion.prompt}</Text>
              <Tag
                color={
                  currentQuestion.difficulty === "hard"
                    ? "magenta"
                    : currentQuestion.difficulty === "medium"
                    ? "geekblue"
                    : "green"
                }
              >
                {currentQuestion.difficulty.toUpperCase()}
              </Tag>
            </div>
            {currentQuestion.guidance && (
              <Alert
                className={styles.questionGuidance}
                type="info"
                showIcon
                message="Guidance"
                description={currentQuestion.guidance}
              />
            )}
            <div className={styles.timerRow}>
              <Tag color={timerCritical ? "red" : "blue"} className={styles.timerChip}>
                Time left: {timerRemaining}
              </Tag>
              <Text type="secondary">Press Ctrl/Cmd + Enter to submit quickly.</Text>
            </div>
            <Input.TextArea
              value={answerDraft}
              onChange={(event) => setAnswerDraft(event.target.value)}
              onPressEnter={handleEditorEnter}
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder="Describe your approach, trade-offs, and examples."
              disabled={
                isSubmittingAnswer ||
                stage !== "questioning" ||
                (currentTimer?.remainingSeconds ?? 0) <= 0
              }
            />
            <Space style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Button
                type="primary"
                onClick={() => void handleSubmitAnswer(false)}
                loading={isSubmittingAnswer}
                disabled={
                  stage !== "questioning" ||
                  (currentTimer?.remainingSeconds ?? 0) <= 0 ||
                  !answerDraft.trim()
                }
              >
                Submit answer
              </Button>
            </Space>
          </div>
        )}

        {stage === "completed" && (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Alert
              type="success"
              showIcon
              message="All done! Thanks for completing the interview."
              description="An interviewer will review your responses shortly."
            />
            <Button type="primary" danger onClick={handleReset}>
              Reset
            </Button>
          </Space>
        )}
      </div>
    );
  };

  const renderProfileEditor = () => {
    const fieldHasWarning = (field: RequiredProfileField) => missingFields.includes(field);

    if (!shouldShowProfileEditor) {
      return (
        <Alert
          type="success"
          message="All required details are confirmed."
          icon={<CheckCircleTwoTone twoToneColor="#52c41a" />}
          showIcon
        />
      );
    }

    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {missingFields.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="We couldn't find everything in your resume. Please fill in the missing details to continue."
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Edit your contact details if the automatic parser got anything wrong."
          />
        )}
        {missingFields.length > 0 && (
          <div className={styles.missingFields}>
            {missingFields.map((field: RequiredProfileField) => (
              <Tag key={field} color="orange">
                Missing: {field.toUpperCase()}
              </Tag>
            ))}
          </div>
        )}
        <Form
          form={form}
          layout="vertical"
          className={styles.profileForm}
          onValuesChange={(changedValues: Record<string, unknown>) => {
            const [field, value] = Object.entries(changedValues)[0] ?? [];
            if (field && value !== undefined) {
              handleProfileFieldChange(field as RequiredProfileField, value as string);
            }
          }}
        >
          <Form.Item
            label="Full Name"
            name="name"
            required
            validateStatus={fieldHasWarning("name") ? "warning" : undefined}
            help={fieldHasWarning("name") ? "Name is required to personalize the interview." : undefined}
          >
            <Input placeholder="Enter your full name" allowClear />
          </Form.Item>
          <Form.Item
            label="Email"
            name="email"
            required
            validateStatus={fieldHasWarning("email") ? "warning" : undefined}
            help={fieldHasWarning("email") ? "We'll use this to share your interview recap." : undefined}
          >
            <Input type="email" placeholder="Enter your email address" allowClear />
          </Form.Item>
          <Form.Item
            label="Phone"
            name="phone"
            required
            validateStatus={fieldHasWarning("phone") ? "warning" : undefined}
            help={fieldHasWarning("phone") ? "Provide a phone number so we can reach you if needed." : undefined}
          >
            <Input placeholder="Enter your phone number" allowClear />
          </Form.Item>
        </Form>
      </Space>
    );
  };

  const renderReadyState = () => {
    if (stage !== "ready-to-start") {
      return null;
    }

    return (
      <div className={styles.readyState}>
        <Alert
          message="Great! You're all set to begin the interview."
          description="When you click Start Interview, the timer will begin and your AI interviewer will take over."
          type="info"
          showIcon
        />
        <Button
          type="primary"
          size="large"
          style={{ marginTop: 16 }}
          onClick={handleStartInterview}
          loading={isStartingInterview}
          disabled={isStartingInterview}
        >
          Start Interview
        </Button>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {!hasInterviewBegun && (
        <>
          <div className={styles.panel}>
            <Title level={4} className={styles.sectionTitle}>
              Resume Upload
            </Title>
            <Upload.Dragger {...uploadProps} className={styles.uploadDragger}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag your resume here.</p>
              <p className={styles.uploadHint}>Only PDF or DOCX files up to 10 MB are supported.</p>
            </Upload.Dragger>

            {resumeParse.status === "parsing" && (
              <Alert style={{ marginTop: 16 }} type="info" message="Parsing resume..." showIcon />
            )}

            {resumeParse.status === "error" && resumeParse.error && (
              <Alert
                style={{ marginTop: 16 }}
                type="error"
                message="Something went wrong while parsing your resume."
                description={resumeParse.error}
                showIcon
              />
            )}

            {activeProfile?.resume && (
              <Space direction="vertical" style={{ width: "100%", marginTop: 24 }}>
                <Space align="baseline" style={{ justifyContent: "space-between", width: "100%" }}>
                  <Text strong>Latest upload</Text>
                  <Button type="link" onClick={handleReset} danger>
                    Upload different resume
                  </Button>
                </Space>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="File name">
                    {activeProfile.resume.fileName}
                  </Descriptions.Item>
                  <Descriptions.Item label="Uploaded">
                    {dayjs(activeProfile.resume.uploadedAt).format("MMM D, YYYY h:mm A")}
                  </Descriptions.Item>
                  <Descriptions.Item label="Detected role">
                    {activeProfile.role}
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            )}
          </div>

          <div className={styles.panel}>
            <Title level={4} className={styles.sectionTitle}>
              Profile Confirmation
            </Title>

            {activeProfile ? (
              <Space direction="vertical" size="large" style={{ width: "100%" }}>
                <div className={styles.profileOverview}>
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="Name">
                      <Space>
                        <Text>{activeProfile.name ?? "Not yet provided"}</Text>
                        {activeProfile.name ? (
                          <Badge status="success" text="Ready" />
                        ) : (
                          <Badge status="processing" text="Pending" />
                        )}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Email">
                      <Space>
                        <Text>{activeProfile.email ?? "Not yet provided"}</Text>
                        {activeProfile.email ? (
                          <Badge status="success" text="Ready" />
                        ) : (
                          <Badge status="processing" text="Pending" />
                        )}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Phone">
                      <Space>
                        <Text>{activeProfile.phone ?? "Not yet provided"}</Text>
                        {activeProfile.phone ? (
                          <Badge status="success" text="Ready" />
                        ) : (
                          <Badge status="processing" text="Pending" />
                        )}
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>
                  {showEditButton && (
                    <div className={styles.profileActions}>
                      <Button
                        type={shouldShowProfileEditor ? "default" : "primary"}
                        icon={<EditOutlined />}
                        onClick={handleToggleProfileEditing}
                      >
                        {shouldShowProfileEditor ? "Close editor" : "Edit details"}
                      </Button>
                    </div>
                  )}
                </div>

                {renderProfileEditor()}
                {renderReadyState()}
              </Space>
            ) : (
              <Alert
                type="info"
                showIcon
                message="Upload your resume to get started."
                description="We'll automatically extract your contact details so the AI interviewer can address you properly."
              />
            )}
          </div>
        </>
      )}

      {renderInterviewPanel()}
    </div>
  );
};
