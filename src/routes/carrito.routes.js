const router = require('express').Router();
const c = require('../controllers/carrito.controller');

router.get('/',              c.getAll);
router.get('/:usuario_id',   c.getById);
router.post('/',             c.create);
router.patch('/:usuario_id', c.update);
router.delete('/:usuario_id', c.remove);

module.exports = router;
