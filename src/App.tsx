import { Layout, Tabs } from "antd";
import { useMemo } from "react";
import { IntervieweeView } from "./features/interviewee/IntervieweeView";
import { InterviewerView } from "./features/interviewer/InterviewerView";
import styles from "./styles/App.module.css";

const App = () => {
  const tabItems = useMemo(
    () => [
      {
        key: "interviewee",
        label: "Interviewee",
        children: <IntervieweeView />
      },
      {
        key: "interviewer",
        label: "Interviewer",
        children: <InterviewerView />
      }
    ],
    []
  );

  return (
    <Layout className={styles.appLayout}>
      <Layout.Header className={styles.header}>
        <div className={styles.brand}>Crisp Interview Assistant</div>
      </Layout.Header>
      <Layout.Content className={styles.content}>
        <Tabs defaultActiveKey="interviewee" items={tabItems} destroyInactiveTabPane={false} />
      </Layout.Content>
    </Layout>
  );
};

export default App;
