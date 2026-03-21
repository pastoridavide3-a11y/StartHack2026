# Request Portal

A **data-driven procurement** playground: corporate requests, a supplier catalog, policy rules, and pipeline outputs stored as local files. The focus is on **realistic datasets** (requests, suppliers, pricing, policies) and **extractors** that turn free text into structured fields you can compare with manually entered data.

---

## Data & pipeline

- **Sources** under `backend/data/`: requests and results as JSON; suppliers, categories, and pricing as CSV; policies as JSON. Human-readable and versionable without a database.
- **Flow**: a request can be enriched by a language model (field extraction from text), then passes through rules and scoring; full results land in `processed_outputs.json` for analysis and dashboards.
- **Views**: trends by department (business unit), supplier comparisons (quality / risk / ESG), escalations, and summary KPIs — meant for exploring aggregates and data quality, not only UI navigation.

---

## Quick start

1. Set `GROQ_API_KEY` in a `.env` file at the repo root (never commit secrets).
2. Backend: `pip install -r backend/requirements.txt`, then `python -m uvicorn backend.main:app --reload --port 8010`
3. Frontend: `npm install`, then `npm run dev` → open `http://localhost:3000`

---

*Demo / hackathon use — align runtime and policies with your own requirements for sensitive data.*
