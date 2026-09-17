const express = require('express');
const { statementScope } = require('../services/bankStatement');
const { bankSubledger } = require('../services/bankSubledger');

function createBankSubledgerRouter(repository) {
  const router=express.Router();
  router.get('/',async(req,res)=>{
    try {
      const scope=statementScope(req.query), snapshot=await repository.readSubledgerData(req.user.id);
      res.set('Cache-Control','private, no-store').json(bankSubledger(snapshot,req.user.id,scope));
    } catch(e) {res.status(e.status||500).json({error:e.status?e.message:'No se pudo consultar el auxiliar bancario.'});}
  });
  return router;
}
module.exports={createBankSubledgerRouter};
