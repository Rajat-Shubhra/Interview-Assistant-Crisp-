import { Card, Col, Descriptions, Empty, List, Progress, Row, Space, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useAppSelector } from "../../store/hooks";
import {
  selectActiveProfile,
  selectActiveSession,
  selectCandidateRecords
} from "../../store/selectors";
import type {
  CandidateArchiveRecord,
  ChatMessage,
  InterviewQuestion,
  QuestionDifficulty,
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

  const stage: SessionStage = (activeSession?.stage ?? "resume-upload") as SessionStage;
  const stageDetails = STAGE_DETAILS[stage];
  const summary = activeSession?.summary ?? null;

  const orderedQuestions = useMemo<InterviewQuestion[]>(() => {
    if (!activeSession) {
      return [];
    }

    return activeSession.questionOrder
      .map((id) => activeSession.questions[id])
      .filter((question): question is InterviewQuestion => Boolean(question));
  }, [activeSession]);

  const questionRows = useMemo<QuestionRow[]>(() => {
    if (!activeSession) {
      return [];
    }

    return orderedQuestions.map((question, index) => {
      const answer = activeSession.answers[question.id];
      const isCurrent = activeSession.currentQuestionId === question.id;

      let statusLabel = "Pending";
      let statusColor = "default";

      if (answer) {
        statusLabel = answer.autoSubmitted ? "Auto-submitted" : "Answered";
        statusColor = answer.autoSubmitted ? "orange" : "green";
      } else if (stage === "completed") {
        statusLabel = "Unanswered";
        statusColor = "magenta";
      } else if (isCurrent && stage === "questioning") {
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
  }, [activeSession, orderedQuestions, stage]);

  const totalQuestions = orderedQuestions.length;
  const answeredCount = activeSession ? Object.keys(activeSession.answers).length : 0;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const progressStatus = stage === "completed" ? "success" : stage === "questioning" ? "active" : "normal";

  const currentQuestionId = activeSession?.currentQuestionId ?? null;
  const currentQuestionIndex = currentQuestionId && activeSession
    ? activeSession.questionOrder.indexOf(currentQuestionId)
    : -1;
  const currentQuestion = currentQuestionId
    ? activeSession?.questions[currentQuestionId] ?? null
    : null;

  const transcript = useMemo<ChatMessage[]>(() => {
    if (!activeSession) {
      return [];
    }
    return [...activeSession.chat].sort(
      (a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf()
    );
  }, [activeSession]);

  const recentCandidates = useMemo<CandidateArchiveRecord[]>(() => {
    return candidateHistory.slice(0, 6);
  }, [candidateHistory]);

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

  return (
    <div className={styles.wrapper}>
      <div className={styles.layoutGrid}>
        <div className={styles.column}>
          <Card
            title="Active interview"
            className={styles.fullWidthCard}
            extra={stageDetails ? <Tag color={stageDetails.color}>{stageDetails.label}</Tag> : null}
          >
            {activeProfile ? (
              <Space direction="vertical" size="large" style={{ width: "100%" }}>
                <div className={styles.progressSummary}>
                  <div>
                    <Title level={4} style={{ marginBottom: 4 }}>
                      {activeProfile.name ?? "Unnamed candidate"}
                    </Title>
                    <Text type="secondary">{activeProfile.role}</Text>
                    <br />
                    <Text type="secondary">
                      Interview started {activeSession ? dayjs(activeSession.createdAt).format("MMM D, h:mm A") : "—"}
                    </Text>
                  </div>
                  <div className={styles.scorePill}>
                    <span className={styles.scoreValue}>{answeredCount}</span>
                    <Text type="secondary">answered</Text>
                  </div>
                </div>
                <Progress
                  percent={progressPercent}
                  status={progressStatus}
                  format={() => `${answeredCount}/${totalQuestions || 0}`}
                />
                {stageDetails && <Text type="secondary">{stageDetails.hint}</Text>}
                <Descriptions
                  size="small"
                  column={1}
                  bordered
                  labelStyle={{ width: 140 }}
                  contentStyle={{ whiteSpace: "nowrap" }}
                >
                  <Descriptions.Item label="Email">
                    {activeProfile.email ? (
                      <a href={`mailto:${activeProfile.email}`}>{activeProfile.email}</a>
                    ) : (
                      <Text type="secondary">Not provided</Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Phone">
                    {activeProfile.phone ?? <Text type="secondary">Not provided</Text>}
                  </Descriptions.Item>
                  <Descriptions.Item label="Stage">{stageDetails?.label ?? "—"}</Descriptions.Item>
                  {currentQuestion && (
                    <Descriptions.Item label="Current question">
                      Question {currentQuestionIndex + 1} of {totalQuestions}: {currentQuestion.prompt}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Space>
            ) : (
              <Empty description="No live interview yet. The interviewer dashboard will activate once a candidate uploads a resume." />
            )}
          </Card>

          <Card title="Question progress" className={styles.fullWidthCard}>
            {questionRows.length > 0 ? (
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
              <Empty description="Questions will appear here once the interview begins." />
            )}
          </Card>

          <Card title="Conversation transcript" className={styles.fullWidthCard}>
            {transcript.length > 0 ? (
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
              <Empty description="Chat messages will stream in once the interview starts." />
            )}
          </Card>
        </div>

        <div className={styles.column}>
          <Card title="Interview summary" className={styles.fullWidthCard}>
            {summary && activeSession ? (
              <div className={styles.summarySection}>
                <div className={styles.progressSummary}>
                  <div>
                    <Title level={4} style={{ marginBottom: 4 }}>
                      Overall score
                    </Title>
                    <Text type="secondary">
                      Updated {dayjs(activeSession.updatedAt).format("MMM D, h:mm A")}
                    </Text>
                  </div>
                  <div className={styles.scorePill}>
                    <span className={styles.scoreValue}>{summary.finalScore.toFixed(1)}</span>
                    <Text type="secondary">/10</Text>
                  </div>
                </div>
                <Paragraph>{summary.summaryText}</Paragraph>
                <span className={styles.dividerText}>Strengths</span>
                <ul className={styles.strengthsList}>
                  {summary.strengths.length > 0 ? (
                    summary.strengths.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>No specific strengths captured.</li>
                  )}
                </ul>
                <span className={styles.dividerText}>Improvements</span>
                <ul className={styles.improvementsList}>
                  {summary.improvements.length > 0 ? (
                    summary.improvements.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>No improvement notes recorded.</li>
                  )}
                </ul>
              </div>
            ) : (
              <Empty description="Once the interview wraps up, the AI summary will appear here." />
            )}
          </Card>

          <Card title="Recent candidates" className={styles.fullWidthCard}>
            {recentCandidates.length > 0 ? (
              <List
                className={styles.historyList}
                itemLayout="vertical"
                dataSource={recentCandidates}
                renderItem={(record: CandidateArchiveRecord) => {
                  const isActive = activeProfile?.id === record.id;
                  const summaryPreview = record.summary?.summaryText ?? "";

                  return (
                    <List.Item
                      key={record.id}
                      actions={[
                        <Tag color="purple" key="score">
                          {record.finalScore.toFixed(1)} / 10
                        </Tag>
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={8}>
                            <Text strong>{record.profile.name ?? "Unnamed candidate"}</Text>
                            {isActive && <Tag color="processing">Live</Tag>}
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={2} style={{ width: "100%" }}>
                            <Text type="secondary">
                              {dayjs(record.completedAt).format("MMM D, YYYY h:mm A")}
                            </Text>
                            {record.profile.email && (
                              <Text type="secondary">{record.profile.email}</Text>
                            )}
                            {summaryPreview && (
                              <Text ellipsis={{ tooltip: summaryPreview }}>{summaryPreview}</Text>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty description="Completed interviews will be listed here for quick reference." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
