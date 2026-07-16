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
   - `IAMReadOnlyAccess` (Elastic Beanstalk needs to read/create a service role on your behalf)

   > For a personal/lecture project this set is fine. For anything shared with others, scope
   > these down further — full-access policies are broader than the CLI actually needs.
5. Create the user.

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
back and fill in (Part 3, step 1):

```js
origin: ["http://localhost:5173", process.env.FRONTEND_URL].filter(Boolean),
```

This reads the production frontend URL from an environment variable instead of hardcoding it,
so you don't need to edit code again after the CloudFront domain exists.

### 2. Initialize Elastic Beanstalk

From the `mern-chat-backend` directory:

```bash
cd mern-chat-backend
eb init
```

- Select your region.
- Application name: `mern-chat-backend` (or any name).
- Platform: **Node.js** (pick the latest supported version).
- Skip CodeCommit setup.
- Set up SSH: yes (useful for debugging via `eb ssh` later).

### 3. Create the environment

```bash
eb create mern-chat-env
```

This provisions an EC2 instance, security group, and load balancer. It takes a few minutes.

### 4. Set environment variables

Elastic Beanstalk needs the same variables as your local `.env`, plus `FRONTEND_URL`:

```bash
eb setenv MONGO_URL="<your-mongodb-connection-string>" JWT_SECRET="<a-long-random-secret>" FRONTEND_URL="https://<your-cloudfront-domain>"
```

You can leave `FRONTEND_URL` blank for now and update it after Part 2 with the same command.

> Do not commit these values or put them in `.ebextensions` in plaintext — `eb setenv` stores
> them as environment properties on the EB environment, not in your repo.

### 5. Deploy

```bash
eb deploy
```

### 6. Allow Atlas to accept connections from EB

Elastic Beanstalk's EC2 instance has a dynamic public IP unless you attach an Elastic IP. Easiest
path for a small/personal project: in MongoDB Atlas → **Network Access** → **Add IP Address** →
allow `0.0.0.0/0` (same tradeoff noted in [SETUP.md](SETUP.md) — fine for this project, not for
a sensitive production system).

### 7. Verify

```bash
eb open
```

This opens the EB URL in a browser — you should see the same JSON welcome response as
`http://localhost:5000/` locally. Also check:

- `https://<your-eb-url>/api-docs` — Swagger docs load
- `eb logs` — if anything failed, this shows the EC2 instance logs (includes the
  `Connected to DB` line if Mongo connected successfully)

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

### 3. Create an S3 bucket

```bash
aws s3 mb s3://<your-unique-bucket-name>
```

Bucket names are globally unique across all AWS accounts, so pick something specific
(e.g. `mern-chat-frontend-yourname`).

### 4. Upload the build

```bash
aws s3 sync dist/ s3://<your-unique-bucket-name> --delete
```

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

- **Backend**: `cd mern-chat-backend && eb deploy`
- **Frontend**: `cd mern-chat-frontend && npm run build && aws s3 sync dist/ s3://<your-bucket-name> --delete`, then invalidate the CloudFront cache so viewers get the new build immediately:
  ```bash
  aws cloudfront create-invalidation --distribution-id <your-distribution-id> --paths "/*"
  ```

## Tearing down (avoid ongoing charges)

This project incurs AWS costs while the environment/bucket/distribution exist (EB runs an EC2
instance + load balancer continuously). To tear everything down:

```bash
cd mern-chat-backend
eb terminate mern-chat-env
```

```bash
aws s3 rb s3://<your-unique-bucket-name> --force
```

Then in the CloudFront console, disable and delete the distribution (CloudFront requires
disabling before deletion, and disabling can take several minutes to take effect).
