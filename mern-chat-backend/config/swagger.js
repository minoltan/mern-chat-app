const swaggerJSDoc = require("swagger-jsdoc");

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "MERN Chat App API",
    version: "1.0.0",
    description: "REST API documentation for the MERN chat backend (users, groups, messages).",
  },
  servers: [
    {
      url: "/api",
      description: "API base path",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          _id: { type: "string" },
          username: { type: "string" },
          email: { type: "string", format: "email" },
          isAdmin: { type: "boolean" },
        },
      },
      AuthUser: {
        type: "object",
        properties: {
          _id: { type: "string" },
          username: { type: "string" },
          email: { type: "string", format: "email" },
          isAdmin: { type: "boolean" },
          token: { type: "string" },
        },
      },
      Group: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          admin: { $ref: "#/components/schemas/User" },
          members: {
            type: "array",
            items: { $ref: "#/components/schemas/User" },
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Message: {
        type: "object",
        properties: {
          _id: { type: "string" },
          content: { type: "string" },
          group: { type: "string" },
          sender: { $ref: "#/components/schemas/User" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
