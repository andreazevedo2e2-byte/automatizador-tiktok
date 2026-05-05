const { createApp } = require("./app.cjs");

const app = createApp();
const port = app.locals.port || Number(process.env.PORT || 4141);
const host = app.locals.host || process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Automatizador API running on http://${host}:${port}`);
});
