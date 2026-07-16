# Deploying to AWS (simplest option)

This deploys the stack as:

- **Backend** (Express + Socket.IO) → **AWS Elastic Beanstalk** (Node.js platform)
- **Frontend** (Vite/React build) → **S3 + CloudFront**
- **Database** → **MongoDB Atlas** (unchanged — see [SETUP.md](SETUP.md))

Elastic Beanstalk is used because it provisions the EC2 instance, security group, and load
balancer for you and supports WebSockets (required by Socket.IO) out of the box. S3 + CloudFront
is used for the frontend because it's a static Vite build — no server needed, just a CDN.

## Prerequisites

- An AWS account with billing enabled
- An IAM user with programmatic access set up (see [Part 0](#part-0--aws-console-setup) below) — don't use root account credentials for the CLI
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed
- [EB CLI](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3-install.html) installed (`pip install awsebcli` or `brew install awsebcli`)
- A working MongoDB Atlas cluster and connection string (from [SETUP.md](SETUP.md))
- The app running locally per [SETUP.md](SETUP.md)

---

## Part 0 — AWS console setup

This is a one-time setup per AWS account. Skip to Part 1 if you already have an IAM user with
CLI access configured.

### 1. Create an AWS account (if you don't have one)

Go to [aws.amazon.com](https://aws.amazon.com) → **Create an AWS Account** and follow the
signup flow (requires a credit card, even if you stay within the free tier).

### 2. Create an IAM user for the CLI

The root account login should only be used for account-level tasks (billing, closing the
account) — everyday deploys should use a separate IAM user with just the permissions needed.

1. Sign in to the [AWS Console](https://console.aws.amazon.com/) with your root account.
2. Go to **IAM → Users → Create user**.
3. Name it something like `mern-chat-deployer`.
4. **Permissions options** → **Attach policies directly** → attach these AWS-managed policies:
   - `AdministratorAccess-AWSElasticBeanstalk`
   - `AmazonS3FullAccess`
   - `CloudFrontFullAccess`
   - `IAMFullAccess` (needed because creating the environment in Part 1 involves creating two
     new IAM roles — a service role and an EC2 instance profile — via **Create role** buttons in
     the console; read-only access isn't enough to create them)

   > For a personal/lecture project this set is fine. For anything shared with others, scope
   > these down further — full-access policies are broader than strictly necessary.
5. Create the user.

> If you'll be doing the console steps in this guide (Parts 1–2), also enable **console
> access** for this user (back on the create-user screen, check "Provide user access to the AWS
> Management Console" and set a password) so you can sign in as them instead of root. Signing in
> as root works too and is simplest for a one-off personal project — just don't use root for
> day-to-day work if you plan to keep using this account.

### 3. Generate an access key

1. Open the new user → **Security credentials** tab.
2. Under **Access keys**, click **Create access key**.
3. Select **Command Line Interface (CLI)** as the use case, acknowledge the warning, and continue.
4. Copy the **Access key ID** and **Secret access key** shown (the secret is only shown once —
   if you lose it, delete the key and create a new one).

### 4. Configure the AWS CLI with the new user

```bash
aws configure
```

Enter the access key ID, secret access key, your preferred region (e.g. `us-east-1`), and
output format (`json` is fine). This is the credential the rest of this guide's `aws` and `eb`
commands will use.

---

## Part 1 — Backend on Elastic Beanstalk

### 1. Update the Socket.IO CORS origin

`server.js` currently whitelists only the local dev origin:

```js
const io = socketio(server, {
  cors: {
    origin: ["http://localhost:5173"],
    ...
  },
});
```

You won't know the final CloudFront URL until Part 2, so for now add a placeholder you'll come
back and fill in (Part 2, step 6):

```js
origin: ["http://localhost:5173", process.env.FRONTEND_URL].filter(Boolean),
```

This reads the production frontend URL from an environment variable instead of hardcoding it,
so you don't need to edit code again after the CloudFront domain exists.

### 2. Package the backend code

Elastic Beanstalk's console deploys a zip of your source — it runs `npm install` itself, so
exclude `node_modules` (and anything else not needed to run the app):

```bash
cd mern-chat-backend
zip -r ../mern-chat-backend.zip . -x "node_modules/*" -x ".git/*" -x ".env" -x "docs/*"
```

### 3. Create the application and environment (console)

1. Sign in to the [Elastic Beanstalk console](https://console.aws.amazon.com/elasticbeanstalk/).
2. Make sure the region selector (top right) is set to the region you want to deploy in.
3. Click **Create application**. This opens a multi-step wizard.

**Step 1 — Configure environment**

1. **Application name**: `mern-chat-backend`.
2. **Environment name**: leave the auto-filled value (e.g. `Mern-chat-backend-env`), or rename it.
3. **Platform**: choose **Node.js**, and leave the platform version/branch at the latest
   recommended.
4. **Application code**: select **Upload your code** → **Choose file** → pick
   `mern-chat-backend.zip` from step 2 above → give the version a label (e.g. `initial`).
5. Click **Next**.

**Step 2 — Configure service access**

Elastic Beanstalk needs two IAM roles before it can provision anything: a **service role** (so
EB itself can create/manage resources on your behalf) and an **EC2 instance profile** (so the
EC2 instance it launches can do what the app needs). If this is your first environment, you
won't have either yet — create both here:

1. **Service role** → click **Create role**. This opens a new tab at IAM's role creation screen,
   pre-filled for this purpose:
   - **Trusted entity type**: AWS service (already selected).
   - **Service or use case**: `Elastic Beanstalk`.
   - **Use case**: select **Elastic Beanstalk - Environment**.
   - Click **Next** → **Next** (the required policies are attached automatically) → **Create
     role**.
   - Close that tab, go back to the EB wizard tab, and click the refresh icon (↻) next to
     **Service role** — the new role now appears in the dropdown; select it.
2. **EC2 instance profile** → click **Create role** the same way:
   - **Service or use case**: `Elastic Beanstalk` again.
   - **Use case**: select **Elastic Beanstalk - Compute** this time (not Environment).
   - Finish creating it, then refresh and select it in the **EC2 instance profile** dropdown.
3. **EC2 key pair** — optional; skip unless you specifically want SSH access to the instance.
4. Click **Next**.

**Steps 3–5 — networking/database/tags, instance traffic and scaling, updates/monitoring/logging (all optional)**

You can safely click **Skip to review** here for this project:

- Networking/database/tags: not needed — we're using MongoDB Atlas, not RDS.
- Instance traffic and scaling: this is where the EC2 instance type lives if you want to set it
  explicitly. Default is fine, but if you want to be sure you're on the free tier, edit **Instance
  types** here and set it to `t3.micro`.
- Updates, monitoring, and logging: this is also where environment variables can be set (covered
  separately in step 4 below, after the environment exists — either place works).

**Step 6 — Review**

Check the summary and click **Submit**. This provisions an EC2 instance, security group, and
load balancer — it takes several minutes. You'll land on the environment dashboard once it's
ready, showing a URL like `mern-chat-env.eba-xxxxx.<region>.elasticbeanstalk.com`.

> **Prefer the CLI?** The [EB CLI](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3-install.html)
> does all of the above in two commands — it creates the service role/instance profile for you
> automatically: `eb init` (interactive prompts for the same choices as above), then
> `eb create mern-chat-env`.

### 4. Set environment variables (console)

Elastic Beanstalk needs the same variables as your local `.env`, plus `FRONTEND_URL`:

1. On the environment dashboard, go to **Configuration** in the left sidebar.
2. Find the **Updates, monitoring, and logging** category → click **Edit**.
3. Scroll to **Environment properties** and add:
   | Name | Value |
   |---|---|
   | `MONGO_URL` | `<your-mongodb-connection-string>` |
   | `JWT_SECRET` | `<a-long-random-secret>` |
   | `FRONTEND_URL` | *(leave blank for now — you'll fill this in after Part 2)* |
4. Click **Apply**. Elastic Beanstalk restarts the app with the new variables (no full
   redeploy needed).

> Do not commit these values into the repo or the zip — environment properties are stored on
> the EB environment itself, separate from your source code.
>
> **Prefer the CLI?** `eb setenv MONGO_URL="..." JWT_SECRET="..." FRONTEND_URL="..."` does the
> same thing in one command.

### 5. Allow Atlas to accept connections from EB

Elastic Beanstalk's EC2 instance has a dynamic public IP unless you attach an Elastic IP. Easiest
path for a small/personal project: in MongoDB Atlas → **Network Access** → **Add IP Address** →
allow `0.0.0.0/0` (same tradeoff noted in [SETUP.md](SETUP.md) — fine for this project, not for
a sensitive production system).

### 6. Verify

On the environment dashboard, click the URL shown near the top (same
`...elasticbeanstalk.com` address from step 3) — it opens in a browser. You should see the same
JSON welcome response as `http://localhost:5000/` locally. Also check:

- `https://<your-eb-url>/api-docs` — Swagger docs load
- If it's not working, go to the environment's **Logs** page in the left sidebar → **Request
  logs** → **Last 100 lines**, which shows the same output as running the app locally
  (including the `Connected to DB` line if Mongo connected successfully).

> **Prefer the CLI?** `eb open` opens the URL directly, and `eb logs` fetches the logs.

Keep the EB URL — you'll need it for `VITE_API_URL` in Part 2.

---

## Part 2 — Frontend on S3 + CloudFront

### 1. Point the frontend at the deployed backend

```bash
cd ../mern-chat-frontend
```

Create `.env.production`:

```env
VITE_API_URL=https://<your-eb-url>
```

### 2. Build

```bash
npm install
npm run build
```

This outputs static files to `dist/`.

### 3. Create an S3 bucket (console)

1. Sign in to the [S3 console](https://console.aws.amazon.com/s3/).
2. Click **Create bucket**.
3. **Bucket name**: pick something globally unique across all AWS accounts, e.g.
   `mern-chat-frontend-yourname`.
4. **AWS Region**: any region is fine — CloudFront serves the content globally regardless of
   which region the bucket lives in.
5. **Block Public Access settings**: leave everything **checked/blocked**. The bucket stays
   private; CloudFront (via OAC, set up in step 5) is what's allowed to read from it, not the
   public internet directly.
6. Leave the rest at their defaults and click **Create bucket**.

> **Prefer the CLI?** `aws s3 mb s3://<your-unique-bucket-name>`

### 4. Upload the build (console)

1. Open the bucket you just created.
2. Click **Upload** → **Add files** / **Add folder**.
3. Select the *contents* of `mern-chat-frontend/dist/` (i.e. `index.html`, the `assets/` folder,
   etc. — not the `dist` folder itself, so files land at the bucket root).
4. Click **Upload** and wait for it to finish.

> **Prefer the CLI?** `aws s3 sync dist/ s3://<your-unique-bucket-name> --delete` — also useful
> for redeploys later since it only uploads changed files and removes stale ones.

### 5. Create a CloudFront distribution

In the AWS Console:

1. **CloudFront → Create distribution**.
2. **Origin domain**: select your S3 bucket.
3. **Origin access**: choose **Origin access control (OAC)** — CloudFront will offer to update
   the bucket policy automatically to allow it to read the bucket; accept it.
4. **Viewer protocol policy**: Redirect HTTP to HTTPS.
5. **Default root object**: `index.html`.
6. Under **Error pages**, add a custom error response so client-side routing works: for both
   `403` and `404`, respond with `/index.html` and HTTP `200`. (`react-router-dom` handles
   routes client-side, so any path CloudFront doesn't recognize as a file needs to fall back to
   `index.html`.)
7. Create the distribution and wait for it to deploy (a few minutes) — note the
   `*.cloudfront.net` domain it gives you.

### 6. Re-point the backend's CORS origin at the real CloudFront URL

Back in the backend:

```bash
cd ../mern-chat-backend
eb setenv FRONTEND_URL="https://<your-cloudfront-domain>"
```

No redeploy needed — `eb setenv` updates the running environment's variables directly.

### 7. Verify end-to-end

- Open `https://<your-cloudfront-domain>` in a browser.
- Register/log in, and confirm chat messages send and receive in real time (this exercises the
  Socket.IO WebSocket connection through CloudFront/S3 → EB, not just the static page load).
- Check the browser console for CORS or WebSocket connection errors — if you see any, confirm
  `FRONTEND_URL` on EB exactly matches the CloudFront domain (including `https://`, no trailing
  slash).

---

## Redeploying after changes

**Backend (console):**

1. Repeat Part 1, step 2 to produce a fresh `mern-chat-backend.zip`.
2. On the environment dashboard, click **Upload and deploy**.
3. Choose the new zip, give it a new version label, and click **Deploy**.

**Frontend (console):**

1. `npm run build` to produce a fresh `dist/`.
2. In the S3 console, upload the new `dist/` contents (overwriting the existing files).
3. In the CloudFront console, open your distribution → **Invalidations** tab → **Create
   invalidation** → path `/*` → **Create invalidation**. This clears the CDN cache so viewers
   get the new build instead of a stale cached copy.

> **Prefer the CLI?**
> - Backend: `cd mern-chat-backend && eb deploy`
> - Frontend: `cd mern-chat-frontend && npm run build && aws s3 sync dist/ s3://<your-bucket-name> --delete`, then `aws cloudfront create-invalidation --distribution-id <your-distribution-id> --paths "/*"`

## Tearing down (avoid ongoing charges)

This project incurs AWS costs while the environment/bucket/distribution exist (EB runs an EC2
instance + load balancer continuously). To tear everything down:

**Backend:** Elastic Beanstalk console → your environment → **Actions** → **Terminate
environment**. Optionally also delete the **Application** itself (Applications list → select →
**Actions** → **Delete application**) once the environment is gone.

**Frontend:** CloudFront console → select your distribution → **Disable** (takes a few minutes
to take effect) → once disabled, **Delete**. Then S3 console → select your bucket → **Empty**
(deletes all objects) → **Delete** the bucket.

> **Prefer the CLI?**
> ```bash
> cd mern-chat-backend
> eb terminate mern-chat-env
> ```
> ```bash
> aws s3 rb s3://<your-unique-bucket-name> --force
> ```
> CloudFront distributions still need to be disabled/deleted via console either way (no simple
> one-line CLI equivalent).
