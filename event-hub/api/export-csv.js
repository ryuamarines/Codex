const { handleApi } = require("../lib/event-api");

module.exports = async (req, res) => handleApi(req, res, "/api/export-csv");
