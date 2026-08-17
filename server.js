require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");

const connectDB = require("./config/db");

// ===============================
// ROUTES
// ===============================

const authRoutes =
  require("./routes/auth");

const userRoutes =
  require("./routes/user");

const activityRoutes =
  require("./routes/activity");

const notificationRoutes =
  require("./routes/notification");

// For a legitimate Daraja sandbox
// integration, add this when ready:
// const mpesaRoutes = require("./routes/mpesa");


// ===============================
// APP
// ===============================

const app = express();

const PORT =
  process.env.PORT || 3000;


// ===============================
// SECURITY / BASIC CONFIG
// ===============================

app.disable("x-powered-by");


// ===============================
// BODY PARSER
// ===============================

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);


// ===============================
// BASIC HEADERS
// ===============================

app.use((req, res, next) => {

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "X-Frame-Options",
    "SAMEORIGIN"
  );

  next();

});


// ===============================
// STATIC FRONTEND
// ===============================

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);


// ===============================
// API ROUTES
// ===============================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/user",
  userRoutes
);

app.use(
  "/api/activity",
  activityRoutes
);

app.use(
  "/api/notifications",
  notificationRoutes
);


// ===============================
// MPESA ROUTE MOUNT
// ===============================
//
// Keep Daraja credentials and
// payment logic inside a dedicated
// service/controller.
//
// Example:
//
// const mpesaRoutes = require("./routes/mpesa");
// app.use("/api/mpesa", mpesaRoutes);
//
// ===============================


// ===============================
// API HEALTH
// ===============================

app.get(
  "/api/health",
  (req, res) => {

    res.status(200).json({
      success: true,
      application: "Betawin",
      server: "online",
      database:
        mongoose.connection.readyState === 1
          ? "connected"
          : "disconnected"
    });

  }
);


// ===============================
// API INFORMATION
// ===============================

app.get(
  "/api",
  (req, res) => {

    res.json({

      success: true,

      message:
        "Betawin API is running",

      endpoints: {

        health:
          "/api/health",

        auth:
          "/api/auth",

        user:
          "/api/user",

        activity:
          "/api/activity",

        notifications:
          "/api/notifications"

      }

    });

  }
);


// ===============================
// FRONTEND HOME
// ===============================

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


// ===============================
// API 404
// ===============================

app.use(
  (req, res, next) => {

    if (
      req.originalUrl.startsWith(
        "/api/"
      )
    ) {

      return res
        .status(404)
        .json({

          success: false,

          message:
            "API endpoint not found",

          path:
            req.originalUrl

        });

    }

    next();

  }
);


// ===============================
// GENERAL 404
// ===============================

app.use(
  (req, res) => {

    res
      .status(404)
      .send(`
        <!DOCTYPE html>

        <html lang="en">

        <head>

          <meta charset="UTF-8">

          <meta
            name="viewport"
            content="width=device-width,
                     initial-scale=1.0"
          >

          <title>Betawin | 404</title>

          <style>

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              min-height: 100vh;

              display: flex;
              align-items: center;
              justify-content: center;

              background: #070710;

              color: white;

              font-family:
                Arial, sans-serif;

              text-align: center;
            }

            .box {
              padding: 30px;
            }

            h1 {
              font-size: 70px;
              margin: 0;
            }

            p {
              color: #888;
            }

            a {
              color: #ff1493;
              text-decoration: none;
            }

          </style>

        </head>

        <body>

          <div class="box">

            <h1>404</h1>

            <p>
              Page not found.
            </p>

            <a href="/">
              ← Back to Betawin
            </a>

          </div>

        </body>

        </html>
      `);

  }
);


// ===============================
// GLOBAL ERROR HANDLER
// ===============================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(
      "SERVER ERROR:",
      err
    );

    if (
      res.headersSent
    ) {

      return next(err);

    }

    res
      .status(
        err.status || 500
      )
      .json({

        success: false,

        message:
          process.env.NODE_ENV ===
          "production"
            ? "Internal server error"
            : err.message

      });

  }
);


// ===============================
// START SERVER
// ===============================

async function startServer() {

  try {

    console.log(
      "================================"
    );

    console.log(
      "Starting Betawin backend..."
    );

    console.log(
      "================================"
    );


    // -------------------------------
    // ENV CHECKS
    // -------------------------------

    if (
      !process.env.MONGO_URI
    ) {

      throw new Error(
        "MONGO_URI is missing from .env"
      );

    }

    if (
      !process.env.JWT_SECRET
    ) {

      throw new Error(
        "JWT_SECRET is missing from .env"
      );

    }


    // -------------------------------
    // DATABASE
    // -------------------------------

    await connectDB();


    // -------------------------------
    // EXPRESS SERVER
    // -------------------------------

    const server =
      app.listen(
        PORT,
        "0.0.0.0",
        () => {

          console.log(
            "================================"
          );

          console.log(
            "🚀 BETAWIN BACKEND ONLINE"
          );

          console.log(
            `🌐 PORT: ${PORT}`
          );

          console.log(
            "🗄️ MongoDB: Connected"
          );

          console.log(
            "🔐 JWT: Enabled"
          );

          console.log(
            `🔗 http://localhost:${PORT}`
          );

          console.log(
            "================================"
          );

        }
      );


    // -------------------------------
    // SERVER ERROR
    // -------------------------------

    server.on(
      "error",
      (error) => {

        console.error(
          "SERVER LISTEN ERROR:",
          error.message
        );

        if (
          error.code ===
          "EADDRINUSE"
        ) {

          console.error(
            `Port ${PORT} is already in use.`
          );

        }

        process.exit(1);

      }
    );


    // -------------------------------
    // GRACEFUL SHUTDOWN
    // -------------------------------

    async function shutdown(
      signal
    ) {

      console.log(
        `\n${signal} received.`
      );

      console.log(
        "Stopping server..."
      );

      server.close(
        async () => {

          try {

            await mongoose
              .connection
              .close();

            console.log(
              "MongoDB connection closed."
            );

            console.log(
              "Server stopped."
            );

            process.exit(0);

          } catch (error) {

            console.error(
              "Shutdown error:",
              error.message
            );

            process.exit(1);

          }

        }
      );

    }


    process.on(
      "SIGTERM",
      () =>
        shutdown("SIGTERM")
    );

    process.on(
      "SIGINT",
      () =>
        shutdown("SIGINT")
    );


  } catch (error) {

    console.error(
      "================================"
    );

    console.error(
      "❌ STARTUP FAILED"
    );

    console.error(
      error.message
    );

    console.error(
      "================================"
    );

    process.exit(1);

  }

}


// ===============================
// START
// ===============================

startServer();
