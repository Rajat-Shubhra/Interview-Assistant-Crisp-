# Interview Assistant (Crisp)

LLM-powered mock interview companion featuring synchronized interviewer and interviewee views, resume ingestion, and automated scoring via Google Gemini.

## Getting started

1. Install dependencies:
	```bash
	npm install
	```
2. Create a `.env` file in the project root with your Gemini configuration:
	```bash
	VITE_GEMINI_API_KEY=your-gemini-key
	# Optional: override the default model (falls back across Gemini 2.5/1.5 flash variants)
	# VITE_GEMINI_MODEL=gemini-2.5-flash-lite
	```
	Keys are provisioned from the [Google AI Studio](https://aistudio.google.com/) dashboard.
3. Start the development server:
	```bash
	npm run dev
	```
4. Run a production build to verify everything compiles:
	```bash
	npm run build
	```

## Key capabilities

- Upload resumes (PDF/DOCX) with automatic parsing and candidate profile extraction.
- Generate tailored interview question sets across difficulty bands.
- Evaluate candidate answers with structured scoring and actionable feedback.
- Summarize the interview with strengths, improvements, and final score for the interviewer.
- Monitor a live interviewer dashboard with question progress, transcript playback, and recent candidate history.

## Environment variables

| Variable              | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `VITE_GEMINI_API_KEY` | Server-side key for Gemini `generateContent`.                               |
| `VITE_GEMINI_MODEL`   | (Optional) Preferred Gemini model ID. Defaults to 2.5 Flash Lite then older flash tiers. |

> The API key is read at runtime in the browser. Avoid checking it into source control.