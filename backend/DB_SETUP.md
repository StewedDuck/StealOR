# StealOR MongoDB Atlas Setup

This guide explains how to create and connect a MongoDB Atlas database for the StealOR project.

## Tech Stack

- **Database:** MongoDB Atlas
- **Runtime:** Node.js
- **Driver / ODM:** MongoDB Driver / Mongoose
- **Environment Management:** `dotenv` (`.env`)

---

## 1. Create a MongoDB Atlas Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create an account or sign in.

---

## 2. Create a MongoDB Atlas Project

After signing in:

1. Create a new project.
2. Give the project a name.

**Example:**
```text
StealOR
```

---

## 3. Create a Database Deployment

Inside the MongoDB Atlas project:

1. Click **Create a Deployment**.
2. Select the **Free** (M0) plan.
3. Choose a cloud provider and region:
   - **Provider:** Google Cloud / AWS
   - **Region:** `Singapore` (Recommended for low latency in Thailand)
4. Enter a cluster name:
   - **Example:** `tor-platform`
5. Disable the sample dataset if it is not needed.
6. Click **Create Deployment**.

---

## 4. Create a Database User

MongoDB Atlas will prompt you to create a database user:

- **Example Username:** `sorasitka_db_user`
- Create a strong password and save it somewhere secure.

> [!IMPORTANT]
> Do not put your database password directly inside your source code or commit it to GitHub.

The username and password will later be used in the MongoDB connection string.

---

## 5. Configure Network Access

MongoDB Atlas only accepts connections from allowed IP addresses.

Navigate to:
> **Security** &rarr; **Network Access** &rarr; **IP Access List** &rarr; **Add IP Address**

### Recommended for Development
Choose **Add Current IP Address**. This allows your current computer to connect to MongoDB Atlas (e.g., `183.xxx.xxx.xxx/32`).

### Temporary Development Option
For testing only, you can allow:
```text
0.0.0.0/0
```
This allows MongoDB to accept connection attempts from any IP address.

> [!WARNING]
> `0.0.0.0/0` is convenient for development and Docker setups, but should **not** normally be used for production environments.

---

## 6. Get the MongoDB Connection String

1. Go to your MongoDB deployment and click **Connect**.
2. Choose **Drivers**.
3. Select:
   - **Driver:** `Node.js`
4. MongoDB Atlas will provide a connection string similar to:
   ```text
   mongodb+srv://USERNAME:PASSWORD@tor-platform.xxxxx.mongodb.net/?appName=tor-platform
   ```
5. Replace `USERNAME` and `PASSWORD` with your MongoDB database user credentials.
   ```text
   mongodb+srv://my_user:my_password@tor-platform.xxxxx.mongodb.net/?appName=tor-platform
   ```
6. Specify the database name (`stealor_db`):
   ```text
   mongodb+srv://my_user:my_password@tor-platform.xxxxx.mongodb.net/stealor_db?appName=tor-platform
   ```

---

## 7. Create the Backend Environment File

Inside `backend/`, create a `.env` file:

```bash
# In backend directory
touch .env
```

Add your configuration to `backend/.env`:

```env
# Server Configuration
PORT=5000

# MongoDB Atlas
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR_CLUSTER.mongodb.net/stealor_db?appName=tor-platform
```

Replace `USERNAME`, `PASSWORD`, and `YOUR_CLUSTER` with the real values from MongoDB Atlas.

### Example Project Structure

```text
StealOR/
├── backend/
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── src/
│
└── frontend/
```

---

## 8. Protect the `.env` File

Never push `.env` to GitHub.

1. Make sure `.gitignore` contains:
   ```gitignore
   .env
   .env.local
   .env.*.local
   ```
2. Maintain a safe template file (`backend/.env.example`):
   ```env
   PORT=5000
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/stealor_db
   ```
   *(Do not put real credentials inside `.env.example`)*

---

## 9. Install MongoDB Packages

Go to the backend directory:

```bash
cd backend
```

Install the MongoDB driver:

```bash
npm install mongodb
```

If the project uses Mongoose:

```bash
npm install mongoose
```

Install `dotenv` if it is not already installed:

```bash
npm install dotenv
```