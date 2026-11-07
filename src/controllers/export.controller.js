const exportService = require("../services/export.service");

async function download(req, res) {
  const { filename, contentType, body } = await exportService.exportData(req.user.id, req.query);
  res.attachment(filename).type(contentType).send(body);
}

module.exports = { download };
