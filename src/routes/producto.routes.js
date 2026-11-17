const router = require('express').Router();
const c = require('../controllers/producto.controller');

router.get('/',     c.getAll);
router.get('/:id',  c.getById);
router.post('/',    c.create);
router.patch('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
