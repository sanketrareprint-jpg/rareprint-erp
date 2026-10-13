<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Web Analytics (GA4 + Search Console, owner only)

`src/web-analytics/` pulls Google Analytics 4 and Google Search Console data
for the website and stores it in Postgres (`WebAnalyticsReport`,
`WebAnalyticsSyncLog`). The ERP page `/web-analytics` reads only from those
tables — it never calls Google on page load.

**Access.** Only the `OWNER_EMAIL` account (see `src/common/super-admin.ts`).
`GET /web-analytics/summary` and `POST /web-analytics/refresh` return 403 to
everyone else, ADMINs included. `GET /web-analytics/access` only tells the nav
whether to show the menu item.

**Environment variables** (backend service only — never in the frontend):

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account key JSON, raw or base64-encoded |
| `GA4_PROPERTY_ID` | Numeric GA4 property id, e.g. `412345678` |
| `GSC_SITE_URL` | `sc-domain:rareprint.in` for a Domain property, or the exact URL-prefix property, e.g. `https://rareprint.in/` |

If any of the three is missing the sync does nothing and the page says it is
not configured (this is the state on SaaS customer deployments).

**How the sync works.**
- Runs every 6 hours (00:00, 06:00, 12:00, 18:00 IST) and when the owner
  clicks **Refresh now**. One sync at a time per server.
- For 7, 28 and 90 days it stores the current period and the period just
  before it, so the page can show the change.
- GA4 periods end yesterday (the last complete day). Search Console lags 2–3
  days, so its periods end on its latest day with final data — shown on the
  page as "Data up to".
- GA4 and Search Console are saved independently: if one fails, the other's
  data is still updated. Every run is recorded in `WebAnalyticsSyncLog` with
  its status (`SUCCESS` / `PARTIAL` / `FAILED`) and error text, and the page
  shows the last error and the last successful sync time for each source.
- "Easy wins" are queries at average position 5–20 with at least 2
  impressions per day of the selected range.

**One-time Google setup.**
1. Go to <https://console.cloud.google.com/>, open the project picker and
   create a new project (e.g. `rareprint-analytics`).
2. In that project, open **APIs & Services → Library** and enable
   **Google Analytics Data API** and **Google Search Console API**.
3. Open **IAM & Admin → Service Accounts → Create service account**. Name it
   (e.g. `erp-analytics`), skip the optional role and user steps, and click
   **Done**. Copy its email (`erp-analytics@<project>.iam.gserviceaccount.com`).
4. Open the service account → **Keys → Add key → Create new key → JSON**. A
   `.json` file downloads. Keep it out of this repo.
5. GA4: <https://analytics.google.com/> → **Admin** → (Property column)
   **Property access management** → **+ → Add users** → paste the service
   account email → role **Viewer** → **Add**. Then **Admin → Property details**
   and copy the numeric **Property ID**.
6. Search Console: <https://search.google.com/search-console> → select the
   rareprint.in property → **Settings → Users and permissions → Add user** →
   paste the service account email → permission **Restricted** → **Add**.
   Note whether the property is a Domain property (`sc-domain:rareprint.in`) or
   a URL-prefix property (use its exact URL, with the trailing `/`).
7. Railway → backend service → **Variables**: add the three variables above.
   For `GOOGLE_SERVICE_ACCOUNT_JSON`, base64 avoids multi-line paste issues —
   in PowerShell:
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json"))`.
   Delete the downloaded key file once it is saved in Railway.
8. Apply the migration `prisma/migrations/20261013130000_add_web_analytics`
   (`node scripts/railway-migrate.js`), deploy, open **Web Analytics** in the
   ERP and click **Refresh now**. Any permission problem shows on the page.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
