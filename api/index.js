const app = require("../server");

module.exports = (req, res) => {
  app(req, res); // let Vercel handle it
};
