const { createApp } = require("./app.cjs");

const app = createApp();
const port = app.locals.port || Number(process.env.PORT || 4141);
const host = app.locals.host || process.env.HOST || "0.0.0.0";
const extraPort = Number(process.env.EXTRA_PORT || 0);

app.listen(port, host, () => {
  console.log(`Automatizador API running on http://${host}:${port}`);
});

if (extraPort && extraPort !== port) {
  app.listen(extraPort, host, () => {
    console.log(`Automatizador API also running on http://${host}:${extraPort}`);
  });
}
