const router = require('express').Router();
const c = require('../controllers/sesion.controller');

router.get('/',        c.getAll);
router.get('/:token',  c.getById);
router.post('/',       c.create);
router.patch('/:token', c.update);
router.delete('/:token', c.remove);

module.exports = router;
