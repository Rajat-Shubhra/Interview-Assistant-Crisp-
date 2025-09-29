import {
  Button,
  Card,
  Descriptions,
  Empty,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import type { TableProps } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppSelector } from "../../store/hooks";
import {
  selectActiveProfile,
  selectActiveSession,
  selectCandidateRecords
} from "../../store/selectors";
import { loadResumeFile } from "../../services/resumeStorage";
import type {
  AnswerRecord,
  CandidateArchiveRecord,
  CandidateProfile,
  ChatMessage,
  InterviewQuestion,
  InterviewSummary,
  QuestionDifficulty,
  ResumeFileMeta,
  SessionStage
} from "../../types/interview";
import styles from "./InterviewerView.module.css";

const { Title, Text, Paragraph } = Typography;

const STAGE_DETAILS: Record<SessionStage, { label: string; color: string; hint: string }> = {
  "resume-upload": {
    label: "Awaiting resume",
    color: "default",
    hint: "The candidate hasn't uploaded their resume yet."
  },
  "profile-completion": {
    label: "Profile review",
    color: "gold",
    hint: "Waiting for the candidate to confirm required contact details."
  },
  "ready-to-start": {
    label: "Ready to begin",
    color: "processing",
    hint: "Interview is ready. Prompt the candidate when you're set to begin."
  },
  questioning: {
    label: "In progress",
    color: "blue",
    hint: "Questions are being asked. Track answers and timing below."
  },
  paused: {
    label: "Paused",
    color: "orange",
    hint: "Interview flow is paused. Resume when both sides are ready."
  },
  completed: {
    label: "Completed",
    color: "green",
    hint: "Interview finished. Review the AI summary and feedback."
  }
};

const DIFFICULTY_COLORS: Record<QuestionDifficulty, string> = {
  easy: "green",
  medium: "geekblue",
  hard: "magenta"
};

const CHAT_SENDER_LABELS: Record<ChatMessage["sender"], string> = {
  assistant: "AI Interviewer",
  candidate: "Candidate",
  system: "System"
};

type QuestionRow = {
  key: string;
  questionNumber: number;
  prompt: string;
  difficulty: QuestionDifficulty;
  statusLabel: string;
  statusColor: string;
  aiScore: number | null;
  elapsedSeconds: number | null;
  aiFeedback?: string;
};

type CandidateDetail = {
  id: string;
  name: string;
  profile: CandidateProfile;
  stage: SessionStage;
  isLive: boolean;
  summary: InterviewSummary | null;
  questions: InterviewQuestion[];
  answers: Record<string, AnswerRecord>;
  chat: ChatMessage[];
  currentQuestionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  finalScore: number | null;
  resume: ResumeFileMeta | null;
};

type CandidateOption = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  timestampLabel: string;
  score: number | null;
  stage: SessionStage;
  isLive: boolean;
  summaryPreview: string;
};

const formatSeconds = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "—";
  }
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds}s`;
};

export const InterviewerView = () => {
  const activeProfile = useAppSelector(selectActiveProfile);
  const activeSession = useAppSelector(selectActiveSession);
  const candidateHistory = useAppSelector(selectCandidateRecords);

  const truncatedHistory = useMemo(() => candidateHistory.slice(0, 12), [candidateHistory]);

  const { candidateOptions, detailById } = useMemo(() => {
    const options: CandidateOption[] = [];
    const detailMap = new Map<string, CandidateDetail>();
    const optionIndex = new Map<string, number>();

    const upsertCandidate = (detail: CandidateDetail, option: CandidateOption) => {
      detailMap.set(detail.id, detail);
      const existingIndex = optionIndex.get(detail.id);
      if (existingIndex !== undefined) {
        options[existingIndex] = option;
      } else {
        optionIndex.set(detail.id, options.length);
        options.push(option);
      }
    };

    if (activeSession && activeProfile) {
      const candidateId = activeProfile.id;
      const sessionStage = activeSession.stage as SessionStage;
      const questions = activeSession.questionOrder
        .map((id) => activeSession.questions[id])
        .filter((question): question is InterviewQuestion => Boolean(question));

      const detail: CandidateDetail = {
        id: candidateId,
        name: activeProfile.name ?? "Unnamed candidate",
        profile: activeProfile,
        stage: sessionStage,
        isLive: sessionStage !== "completed",
        summary: activeSession.summary ?? null,
        questions,
        answers: activeSession.answers,
        chat: activeSession.chat,
        currentQuestionId: activeSession.currentQuestionId,
        createdAt: activeSession.createdAt,
        updatedAt: activeSession.updatedAt,
        completedAt: sessionStage === "completed" ? activeSession.updatedAt : null,
        finalScore: activeSession.summary?.finalScore ?? null,
        resume: activeProfile.resume ?? null
      };

      upsertCandidate(detail, {
        id: candidateId,
        name: detail.name,
        role: activeProfile.role,
        email: activeProfile.email,
        timestampLabel: detail.createdAt
          ? `Started ${dayjs(detail.createdAt).format("MMM D, h:mm A")}`
          : "Live interview",
        score: detail.finalScore,
        stage: detail.stage,
        isLive: detail.isLive,
        summaryPreview: detail.summary?.summaryText ?? ""
      });
    }

    truncatedHistory.forEach((record: CandidateArchiveRecord) => {
      const answersMap = record.answers.reduce<Record<string, AnswerRecord>>((accumulator, answer) => {
        accumulator[answer.questionId] = answer;
        return accumulator;
      }, {});

      const detail: CandidateDetail = {
        id: record.id,
        name: record.profile.name ?? "Unnamed candidate",
        profile: record.profile,
        stage: "completed",
        isLive: false,
        summary: record.summary ?? null,
        questions: record.questions ?? [],
        answers: answersMap,
        chat: record.chat ?? [],
        currentQuestionId: null,
        createdAt: record.completedAt,
        updatedAt: record.completedAt,
        completedAt: record.completedAt,
        finalScore: record.finalScore,
        resume: record.profile.resume ?? null
      };

      upsertCandidate(detail, {
        id: record.id,
        name: detail.name,
        role: record.profile.role,
        email: record.profile.email,
        timestampLabel: record.completedAt
          ? `Completed ${dayjs(record.completedAt).format("MMM D, h:mm A")}`
          : "Completed interview",
        score: record.finalScore,
        stage: "completed",
        isLive: false,
        summaryPreview: detail.summary?.summaryText ?? ""
      });
    });

    return { candidateOptions: options, detailById: detailMap };
  }, [activeProfile, activeSession, truncatedHistory]);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  useEffect(() => {
    if (candidateOptions.length === 0) {
      if (selectedCandidateId !== null) {
        setSelectedCandidateId(null);
      }
      return;
    }

    if (!selectedCandidateId || !candidateOptions.some((option) => option.id === selectedCandidateId)) {
      setSelectedCandidateId(candidateOptions[0].id);
    }
  }, [candidateOptions, selectedCandidateId]);

  const selectedDetail = selectedCandidateId ? detailById.get(selectedCandidateId) ?? null : null;
  const selectedStageDetails = selectedDetail ? STAGE_DETAILS[selectedDetail.stage] : null;

  const answeredCount = selectedDetail ? Object.keys(selectedDetail.answers).length : 0;
  const totalQuestions = selectedDetail?.questions.length ?? 0;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const progressStatus = selectedDetail?.stage === "completed"
    ? "success"
    : selectedDetail?.stage === "questioning"
    ? "active"
    : "normal";

  const transcript = useMemo(() => {
    if (!selectedDetail) {
      return [] as ChatMessage[];
    }
    return [...selectedDetail.chat].sort(
      (left, right) => dayjs(left.createdAt).valueOf() - dayjs(right.createdAt).valueOf()
    );
  }, [selectedDetail]);

  const questionRows = useMemo<QuestionRow[]>(() => {
    if (!selectedDetail) {
      return [];
    }

    return selectedDetail.questions.map((question, index) => {
      const answer = selectedDetail.answers[question.id];
      const isCurrent = selectedDetail.currentQuestionId === question.id;

      let statusLabel = "Pending";
      let statusColor = "default";

      if (answer) {
        statusLabel = answer.autoSubmitted ? "Auto-submitted" : "Answered";
        statusColor = answer.autoSubmitted ? "orange" : "green";
      } else if (selectedDetail.stage === "completed") {
        statusLabel = "Unanswered";
        statusColor = "magenta";
      } else if (isCurrent && selectedDetail.stage === "questioning") {
        statusLabel = "In progress";
        statusColor = "processing";
      }

      return {
        key: question.id,
        questionNumber: index + 1,
        prompt: question.prompt,
        difficulty: question.difficulty,
        statusLabel,
        statusColor,
        aiScore: typeof answer?.aiScore === "number" ? answer.aiScore : null,
        elapsedSeconds: typeof answer?.elapsedSeconds === "number" ? answer.elapsedSeconds : null,
        aiFeedback: answer?.aiFeedback
      } satisfies QuestionRow;
    });
  }, [selectedDetail]);

  const questionColumns: TableProps<QuestionRow>["columns"] = useMemo(
    () => [
      {
        title: "#",
        dataIndex: "questionNumber",
        width: 60,
        align: "center" as const
      },
      {
        title: "Prompt",
        dataIndex: "prompt",
        className: styles.promptColumn,
        render: (value: string) => (
          <Text ellipsis={{ tooltip: value }} className={styles.promptText}>
            {value}
          </Text>
        )
      },
      {
        title: "Difficulty",
        dataIndex: "difficulty",
        width: 130,
        render: (value: QuestionDifficulty) => (
          <Tag color={DIFFICULTY_COLORS[value]}>{value.toUpperCase()}</Tag>
        )
      },
      {
        title: "Status",
        dataIndex: "statusLabel",
        width: 150,
        render: (_: string, record: QuestionRow) => (
          <Tag color={record.statusColor}>{record.statusLabel}</Tag>
        )
      },
      {
        title: "AI Score",
        dataIndex: "aiScore",
        width: 120,
        align: "center" as const,
        render: (value: number | null) =>
          value !== null ? <Text strong>{value.toFixed(1)}</Text> : <Text type="secondary">—</Text>
      },
      {
        title: "Elapsed",
        dataIndex: "elapsedSeconds",
        width: 120,
        align: "center" as const,
        render: (value: number | null) => <Text type="secondary">{formatSeconds(value)}</Text>
      }
    ],
    []
  );

  const handleViewResume = useCallback(async (resume?: ResumeFileMeta | null) => {
    if (!resume) {
      message.info("No resume is available for this candidate yet.");
      return;
    }

    try {
      const stored = await loadResumeFile(resume.id);
      if (!stored) {
        message.warning("We couldn't locate the stored resume file.");
        return;
      }

      const blob = new Blob([stored.buffer], { type: stored.mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error("Failed to open resume", error);
      message.error("Unable to open the resume right now.");
    }
  }, []);

  return (
    <div className={styles.wrapper}>
      <div className={styles.splitLayout}>
        <div className={styles.leftPanel}>
          <Card title="Recent candidates" className={styles.fullWidthCard}>
            {candidateOptions.length > 0 ? (
              <div className={styles.candidateList}>
                {candidateOptions.map((candidate) => {
                  const stageInfo = STAGE_DETAILS[candidate.stage];
                  const isSelected = candidate.id === selectedCandidateId;

                  return (
                    <div
                      key={candidate.id}
                      className={`${styles.listItem} ${isSelected ? styles.selectedListItem : ""}`}
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      data-testid="candidate-entry"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedCandidateId(candidate.id);
                        }
                      }}
                    >
                      <div className={styles.listItemHeader}>
                        <div className={styles.listItemTitle}>
                          <Text strong>{candidate.name}</Text>
                          {stageInfo && <Tag color={stageInfo.color}>{stageInfo.label}</Tag>}
                          {candidate.isLive && candidate.stage !== "completed" && <Tag color="processing">Live</Tag>}
                        </div>
                        {typeof candidate.score === "number" && (
                          <Tag color="purple">{candidate.score.toFixed(1)}/10</Tag>
                        )}
                      </div>
                      <div className={styles.listItemBody}>
                        <Text type="secondary">{candidate.role}</Text>
                        {candidate.email && <Text type="secondary">{candidate.email}</Text>}
                        <Text type="secondary">{candidate.timestampLabel}</Text>
                        {candidate.summaryPreview && (
                          <Text type="secondary" ellipsis={{ tooltip: candidate.summaryPreview }}>
                            {candidate.summaryPreview}
                          </Text>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty description="Interviews you complete will show up here." />
            )}
          </Card>
        </div>

        <div className={styles.rightPanel}>
          <Card title="Interviewee status & info" className={styles.fullWidthCard}>
            {selectedDetail ? (
              <Space direction="vertical" size="large" style={{ width: "100%" }}>
                <div className={styles.progressSummary}>
                  <div>
                    <Title level={4} style={{ marginBottom: 4 }}>
                      {selectedDetail.name}
                    </Title>
                    <div className={styles.infoMeta}>
                      <Text type="secondary">{selectedDetail.profile.role}</Text>
                      {selectedDetail.createdAt && (
                        <Text type="secondary">
                          Started {dayjs(selectedDetail.createdAt).format("MMM D, h:mm A")}
                        </Text>
                      )}
                      {selectedDetail.completedAt && (
                        <Text type="secondary">
                          Completed {dayjs(selectedDetail.completedAt).format("MMM D, h:mm A")}
                        </Text>
                      )}
                    </div>
                  </div>
                  <div className={styles.scorePill}>
                    <span className={styles.scoreValue}>
                      {selectedDetail.finalScore !== null
                        ? selectedDetail.finalScore.toFixed(1)
                        : answeredCount}
                    </span>
                    <Text type="secondary">
                      {selectedDetail.finalScore !== null ? "/10" : "answered"}
                    </Text>
                  </div>
                </div>
                <div className={styles.infoActions}>
                  {selectedStageDetails && (
                    <Tag color={selectedStageDetails.color}>{selectedStageDetails.label}</Tag>
                  )}
                  <Button
                    icon={<FileTextOutlined />}
                    onClick={() => void handleViewResume(selectedDetail.resume)}
                    disabled={!selectedDetail.resume}
                  >
                    View resume
                  </Button>
                </div>
                <Progress
                  percent={progressPercent}
                  status={progressStatus}
                  format={() => `${answeredCount}/${totalQuestions || 0}`}
                />
                {selectedStageDetails?.hint && (
                  <Text className={styles.stageHint}>{selectedStageDetails.hint}</Text>
                )}
                <Descriptions
                  size="small"
                  column={1}
                  bordered
                  labelStyle={{ width: 160 }}
                  contentStyle={{ whiteSpace: "nowrap" }}
                >
                  <Descriptions.Item label="Email">
                    {selectedDetail.profile.email ? (
                      <a href={`mailto:${selectedDetail.profile.email}`}>
                        {selectedDetail.profile.email}
                      </a>
                    ) : (
                      <Text type="secondary">Not provided</Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Phone">
                    {selectedDetail.profile.phone ?? <Text type="secondary">Not provided</Text>}
                  </Descriptions.Item>
                  <Descriptions.Item label="Stage">
                    {selectedStageDetails?.label ?? "—"}
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            ) : (
              <Empty description="Select a candidate to view their details." />
            )}
          </Card>

          <Card title="Question progress" className={styles.fullWidthCard}>
            {selectedDetail && questionRows.length > 0 ? (
              <Table<QuestionRow>
                size="small"
                pagination={false}
                columns={questionColumns}
                dataSource={questionRows}
                rowKey={(row) => row.key}
                expandable={{
                  rowExpandable: (record) => Boolean(record.aiFeedback),
                  expandedRowRender: (record) => (
                    <div className={styles.feedbackRow}>
                      <Text strong>AI feedback</Text>
                      <Paragraph type="secondary" style={{ marginTop: 4 }}>
                        {record.aiFeedback}
                      </Paragraph>
                    </div>
                  )
                }}
                scroll={{ x: true }}
              />
            ) : (
              <Empty
                description={
                  selectedDetail
                    ? "No questions available yet."
                    : "Select a candidate to view question progress."
                }
              />
            )}
          </Card>

          <Card title="Conversation transcript" className={styles.fullWidthCard}>
            {selectedDetail && transcript.length > 0 ? (
              <div className={styles.chatList}>
                {transcript.map((message) => {
                  const senderLabel = CHAT_SENDER_LABELS[message.sender];
                  const score =
                    typeof message.metadata?.score === "number"
                      ? message.metadata.score
                      : null;
                  const itemClass = [styles.chatItem];
                  if (message.sender === "assistant") {
                    itemClass.push(styles.chatAssistant);
                  } else if (message.sender === "candidate") {
                    itemClass.push(styles.chatCandidate);
                  } else {
                    itemClass.push(styles.chatSystem);
                  }

                  return (
                    <div key={message.id} className={itemClass.join(" ")}>
                      <div className={styles.chatHeader}>
                        <span>{senderLabel}</span>
                        <span>{dayjs(message.createdAt).format("MMM D, h:mm A")}</span>
                      </div>
                      <div className={styles.chatBody}>{message.body}</div>
                      {score !== null && <Tag color="purple">Score {score.toFixed(1)}</Tag>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty
                description={
                  selectedDetail
                    ? "Conversation will appear here once messages arrive."
                    : "Select a candidate to view the transcript."
                }
              />
            )}
          </Card>

          <Card title="Interview summary" className={styles.fullWidthCard}>
            {selectedDetail ? (
              selectedDetail.summary ? (
                <div className={styles.summarySection}>
                  <div className={styles.progressSummary}>
                    <div>
                      <Title level={4} style={{ marginBottom: 4 }}>
                        Overall score
                      </Title>
                      <Text type="secondary">
                        Updated {selectedDetail.updatedAt ? dayjs(selectedDetail.updatedAt).format("MMM D, h:mm A") : "—"}
                      </Text>
                    </div>
                    <div className={styles.scorePill}>
                      <span className={styles.scoreValue}>
                        {selectedDetail.summary.finalScore.toFixed(1)}
                      </span>
                      <Text type="secondary">/10</Text>
                    </div>
                  </div>
                  <Paragraph>{selectedDetail.summary.summaryText}</Paragraph>
                  <span className={styles.dividerText}>Strengths</span>
                  <ul className={styles.strengthsList}>
                    {selectedDetail.summary.strengths.length > 0 ? (
                      selectedDetail.summary.strengths.map((item) => <li key={item}>{item}</li>)
                    ) : (
                      <li>No specific strengths captured.</li>
                    )}
                  </ul>
                  <span className={styles.dividerText}>Areas to improve</span>
                  <ul className={styles.improvementsList}>
                    {selectedDetail.summary.improvements.length > 0 ? (
                      selectedDetail.summary.improvements.map((item) => <li key={item}>{item}</li>)
                    ) : (
                      <li>No improvement notes recorded.</li>
                    )}
                  </ul>
                </div>
              ) : selectedDetail.stage === "completed" ? (
                <Empty description="No AI summary was generated for this candidate." />
              ) : (
                <Empty description="Summary will be available once the interview wraps up." />
              )
            ) : (
              <Empty description="Select a candidate to view their summary." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
