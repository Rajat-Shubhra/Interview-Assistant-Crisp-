# Interview Assistant (Crisp)

An intelligent mock interview platform powered by Google Gemini AI that provides synchronized interviewer and interviewee views, automated resume parsing, dynamic question generation, and comprehensive scoring with actionable feedback.

## Project Overview

The Interview Assistant (Crisp) is a modern React-based web application designed to streamline the technical interview process. It leverages Google's Gemini AI to create an intelligent interview experience that benefits both candidates and interviewers. The platform features dual-view interfaces, automatic resume processing, AI-generated questions tailored to candidate profiles, real-time answer evaluation, and comprehensive interview summaries.

### Key Features

- **Dual-Interface Design**: Separate, synchronized views for interviewees and interviewers
- **Intelligent Resume Processing**: Automatic parsing of PDF/DOCX resumes with profile extraction
- **AI-Powered Question Generation**: Dynamic interview questions tailored to candidate experience and role
- **Real-Time Answer Evaluation**: Structured scoring with detailed feedback using Google Gemini
- **Comprehensive Interview Analytics**: Live dashboard with progress tracking and candidate history
- **Persistent Data Storage**: Client-side storage for session continuity and candidate records
- **Flexible Scoring System**: Multi-level difficulty assessment (Easy, Medium, Hard)
- **Timer Management**: Configurable time limits per question with automatic submission

## Getting Started

### Prerequisites

- **Node.js** (version 16 or higher)
- **npm** or **yarn** package manager
- **Google AI Studio API Key** for Gemini integration

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Rajat-Shubhra/Interview-Assistant-Crisp-.git
   cd Interview-Assistant-Crisp-
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file in the project root:
   ```bash
   VITE_GEMINI_API_KEY=your-gemini-api-key-here
   # Optional: Specify preferred Gemini model (defaults to 2.5 Flash Lite)
   # VITE_GEMINI_MODEL=gemini-2.5-flash-lite
   ```

   > **Important**: Get your API key from the [Google AI Studio](https://aistudio.google.com/) dashboard. The key is used client-side, so avoid committing it to version control.

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`

5. **Verify installation** with a production build:
   ```bash
   npm run build
   ```

## Usage

### Basic Interview Flow

Here's a complete example of how to conduct an interview using the platform:

#### For Candidates (Interviewee View):

1. **Upload Resume**:
   ```typescript
   // The application automatically parses uploaded PDF/DOCX files
   // and extracts candidate information (name, email, phone)
   const handleResumeUpload = async (file: File) => {
     const result = await parseResumeFile(file);
     // Profile automatically populated with extracted data
   };
   ```

2. **Complete Profile**:
   ```typescript
   // Fill in any missing required fields
   const candidateProfile = {
     name: "John Doe",
     email: "john.doe@example.com", 
     phone: "+1-555-123-4567",
     role: "Full Stack Engineer"
   };
   ```

3. **Start Interview**:
   ```typescript
   // Begin the interview session
   await dispatch(beginInterview({
     profileId: candidateProfile.id,
     configuration: {
       questionCount: 5,
       timeLimitMinutes: 30,
       difficulty: "medium"
     }
   }));
   ```

4. **Answer Questions**:
   ```typescript
   // Submit answers with timing tracking
   const handleAnswerSubmit = async (answer: string) => {
     await dispatch(submitAnswer({
       questionId: currentQuestion.id,
       answer: answer,
       elapsedSeconds: timer.elapsedSeconds
     }));
   };
   ```

#### For Interviewers (Interviewer View):

1. **Monitor Progress**:
   ```typescript
   // Real-time session monitoring
   const sessionProgress = {
     currentStage: "questioning", // resume-upload | profile-completion | ready-to-start | questioning | completed
     questionsCompleted: 3,
     totalQuestions: 5,
     candidateProfile: candidateProfile,
     chatTranscript: messages
   };
   ```

2. **Review Answers**:
   ```typescript
   // Access detailed answer analytics
   const answerDetails = {
     question: "Explain the difference between let, const, and var in JavaScript",
     candidateAnswer: "...",
     aiScore: 8.5,
     feedback: "Strong understanding of scope and hoisting concepts...",
     timeSpent: 120 // seconds
   };
   ```

3. **Access Interview Summary**:
   ```typescript
   // Comprehensive interview analysis
   const interviewSummary = {
     finalScore: 7.8,
     strengths: ["Strong technical knowledge", "Clear communication"],
     improvements: ["Could elaborate more on system design", "Practice algorithm optimization"],
     recommendation: "Move to next round"
   };
   ```

### Advanced Configuration

#### Custom Question Generation:

```typescript
// Configure AI question generation
const interviewConfig = {
  difficulty: "hard" as QuestionDifficulty,
  questionCount: 8,
  categories: ["algorithms", "system-design", "javascript"],
  timeLimitPerQuestion: 300, // 5 minutes
  role: "Senior Full Stack Engineer"
};

await generateInterviewQuestions(candidateProfile, interviewConfig);
```

#### Resume Parsing Options:

```typescript
// Advanced resume parsing with custom role
const parseOptions = {
  role: "Senior Frontend Developer"
};

const result = await parseResumeFile(resumeFile, parseOptions);
// Returns: { profile, resumeMeta, rawText }
```

#### Data Persistence:

```typescript
// The application automatically handles data persistence
// Candidate records are stored locally using IndexedDB
const candidateHistory = useAppSelector(selectCandidateRecords);
// Resume files are stored securely in browser storage
await persistResumeFile(profileId, resumeFile);
```

## Architecture Overview

### Core Technologies

- **Frontend**: React 18 with TypeScript and Vite
- **State Management**: Redux Toolkit with persistent storage
- **UI Components**: Ant Design for consistent styling
- **File Processing**: PDF.js for PDF parsing, Mammoth for DOCX
- **AI Integration**: Google Gemini API for question generation and evaluation
- **Data Storage**: IndexedDB via idb-keyval for client-side persistence

### Project Structure

```
src/
├── features/
│   ├── interviewee/     # Candidate interface components
│   └── interviewer/     # Interviewer dashboard components
├── services/
│   ├── aiInterviewService.ts    # Gemini AI integration
│   ├── resumeParser.ts         # PDF/DOCX processing
│   └── resumeStorage.ts        # File persistence
├── store/
│   ├── slices/         # Redux state management
│   └── thunks/         # Async actions
└── types/
    └── interview.ts    # TypeScript definitions
```

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `VITE_GEMINI_API_KEY` | Yes | Google AI Studio API key for Gemini integration | - |
| `VITE_GEMINI_MODEL` | No | Preferred Gemini model identifier | `gemini-2.5-flash-lite` |

> **Security Note**: API keys are used client-side. Consider implementing a backend proxy for production deployments to secure API access.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production  
npm run build

# Preview production build
npm run preview

# Run tests
npm test
```

## Testing

The project includes comprehensive tests covering core functionality:

```bash
# Run all tests
npm test

# Key test areas:
# - Resume parsing and profile extraction
# - Session state management
# - Candidate data persistence
# - AI service integration
```

## Browser Compatibility

- **Chrome/Edge**: Full support (recommended)
- **Firefox**: Full support  
- **Safari**: Full support
- **Mobile browsers**: Responsive design with touch support

## Troubleshooting

### Common Issues

1. **"Unable to extract text from resume"**:
   - Ensure the PDF/DOCX file is not password-protected
   - Try re-saving the document in a different format
   - Check file size (10MB limit)

2. **"API key not configured"**:
   - Verify `.env` file exists in project root
   - Confirm `VITE_GEMINI_API_KEY` is set correctly
   - Restart development server after adding environment variables

3. **Build warnings about chunk size**:
   - This is expected due to PDF.js library size
   - Use code splitting for production optimization
