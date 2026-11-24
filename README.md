# PharmeBalance

PharmeBalance is a pharmacy inventory management project designed to predict medication shortages and recommend stock transfers between pharmacies in the same network.

The system uses sales history and current inventory to identify medications at risk of running short over the next 14 days. It recommends transfers from nearby pharmacies with enough surplus stock. Inventory managers approve or reject recommendations, logistics staff coordinate dispatch, and the receiving pharmacy confirms delivery.

PharmeBalance helps pharmacy networks keep medications available, reduce excess inventory, and respond to shortages faster.

## Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | ![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white) ![React](https://img.shields.io/badge/React-087EA4?logo=react&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-0E7490?logo=tailwindcss&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) |
| Backend | ![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white) ![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) |
| Database and ORM | ![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL_17-4169E1?logo=postgresql&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white) |
| API documentation | ![OpenAPI](https://img.shields.io/badge/OpenAPI-406E18?logo=openapiinitiative&logoColor=white) ![Swagger UI](https://img.shields.io/badge/Swagger_UI-173647?logo=swagger&logoColor=white) |
| Planned integrations and tools | ![Overpass API](https://img.shields.io/badge/Overpass_API-39804B?logo=openstreetmap&logoColor=white) ![Prometheus](https://img.shields.io/badge/Prometheus-BD4321?logo=prometheus&logoColor=white) ![Grafana](https://img.shields.io/badge/Grafana-B95000?logo=grafana&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2364B6?logo=githubactions&logoColor=white) |

## Run locally

Requirements: Node.js 20+, PostgreSQL, and Redis.

Install dependencies and create the backend environment file:

```bash
git clone https://github.com/vaSIUl13/PharmeBalance.git
cd PharmeBalance
cd server && npm ci && cp .env.example .env
cd ../client && npm ci
```

Make sure PostgreSQL and Redis are running. Configure the local database connection in `server/.env` if needed, then apply database migrations:

```bash
cd server
npm run db:generate
npm run db:migrate
```

Start the backend and frontend in separate terminals:

```bash
# Terminal 1
cd server
npm run start:dev
```

```bash
# Terminal 2
cd client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The backend runs at [http://localhost:3001](http://localhost:3001).
