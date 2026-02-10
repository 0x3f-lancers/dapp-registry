// import Fastify from "fastify";
// import dotenv from "dotenv";
// import path from "path";
// import crypto from "crypto";
// import logger, { pinoConfig } from "./lib/logger"; // Import both logger instance and config

// dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// const fastify = Fastify({
//   logger: pinoConfig, // Pass the configuration object to Fastify
// });

// fastify.get("/", async (request, reply) => {
//   return { message: "DApp Registry Backend Factory is running!" };
// });

// // HMAC Verification Endpoint
// fastify.post("/revalidate", async (request, reply) => {
//   const hmacSecret = process.env.HMAC_SECRET;
//   if (!hmacSecret || hmacSecret === "super_secret_hmac_key") {
//     fastify.log.error("HMAC_SECRET is not configured. Cannot verify webhook.");
//     return reply.code(500).send({ error: "Server configuration error." });
//   }

//   const signature = request.headers["x-hub-signature-256"] as string;
//   // IMPORTANT: For true HMAC verification, the payload should be the RAW request body.
//   // Fastify parses JSON bodies. To get the raw body, you'd typically need to:
//   // 1. Disable body parsing for this route, or
//   // 2. Use a plugin that exposes the raw body (e.g., @fastify/raw-body)
//   // For this example, we're stringifying the already-parsed body, which works if the sender also stringifies.
//   const payload = JSON.stringify(request.body);

//   if (!signature) {
//     fastify.log.warn("Missing x-hub-signature-256 header.");
//     return reply.code(401).send({ error: "Missing signature." });
//   }

//   // Calculate expected HMAC
//   const hmac = crypto.createHmac("sha256", hmacSecret);
//   hmac.update(payload);
//   const expectedSignature = `sha256=${hmac.digest("hex")}`;

//   if (signature === expectedSignature) {
//     fastify.log.info("Webhook signature verified successfully.");
//     // In a real scenario, trigger actual frontend revalidation here
//     // e.g., an API call to a CDN or a frontend server
//     return reply
//       .code(200)
//       .send({ message: "Webhook received and signature verified." });
//   } else {
//     fastify.log.warn("Webhook signature verification failed.");
//     return reply.code(401).send({ error: "Invalid signature." });
//   }
// });

// const start = async () => {
//   try {
//     const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
//     await fastify.listen({ port });
//     fastify.log.info(`Server listening on ${port}`);
//   } catch (err) {
//     fastify.log.error(err);
//     process.exit(1);
//   }
// };

// start();
import Fastify from "fastify";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import logger, { pinoConfig } from "./lib/logger";
import rawBody from "fastify-raw-body";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const fastify = Fastify({
  logger: pinoConfig,
});

// Register raw body plugin
fastify.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
});

fastify.get("/", async (request, reply) => {
  return { message: "DApp Registry Backend Factory is running!" };
});

// HMAC Verification Endpoint
fastify.post(
  "/revalidate",
  {
    config: {
      rawBody: true,
    },
  },
  async (request, reply) => {
    const hmacSecret = process.env.HMAC_SECRET;
    if (!hmacSecret || hmacSecret === "super_secret_hmac_key") {
      fastify.log.error(
        "HMAC_SECRET is not configured. Cannot verify webhook.",
      );
      return reply.code(500).send({ error: "Server configuration error." });
    }

    const signature = request.headers["x-hub-signature-256"] as string;
    const payload = request.rawBody;

    if (!signature || !payload) {
      fastify.log.warn("Missing signature or payload.");
      return reply.code(401).send({ error: "Missing signature or payload." });
    }

    // Calculate expected HMAC
    const hmac = crypto.createHmac("sha256", hmacSecret);
    hmac.update(payload);
    const expectedSignature = `sha256=${hmac.digest("hex")}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      fastify.log.info("Webhook signature verified successfully.");
      return reply
        .code(200)
        .send({ message: "Webhook received and signature verified." });
    } else {
      fastify.log.warn("Webhook signature verification failed.");
      return reply.code(401).send({ error: "Invalid signature." });
    }
  },
);

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    await fastify.listen({ port });
    fastify.log.info(`Server listening on ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
