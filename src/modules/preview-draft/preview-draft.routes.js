const router = require('express').Router();
const { createDraft, getDraft } = require('./preview-draft.controller.js');

router.post('/', createDraft);
router.get('/', getDraft);

module.exports = router;
