var Stex           = require('stex');
var errors         = Stex.errors;
var _              = Stex._;
var Promise        = Stex.Promise;
var wallet         = require("../models/wallet");
var validate       = require("../util/validate");
var lockout        = require("../models/lockout");
var refererTracker = require("../models/referer-tracker");

var wallets = module.exports;


wallets.show = function(req, res, next) {
  refererTracker.track(req);
  lockout.ensureAllowed(req.ip)
    .then(actuallyLogin)
    .catch(lockout.errors.Disabled, function(err) {
      Promise.delay(lockout.SLEEP_TIME).then(fail);
    });


  function actuallyLogin() {
    var id = (req.body.id || "").toString();

    if (_.isEmpty(id)) {
      res.status(400).send({
        "status": "fail",
        "field":  "id",
        "code":   "missing"
      });
      return;
    }

    wallet.get(id).then(function(wallet) {
      if(typeof wallet === "undefined") {
        //TODO: confirm this works well behind cloudflare
        lockout.record(req.ip);
        fail();
      } else {
        res.send({
          "status" : "success",
          "data"   : _.omit(wallet, ['recoveryId', 'recoveryData'])
        });
      }
    });
  }

  function fail() {
    res.status(404).send({ "status": "fail", "code": "not_found" });
  }
};

wallets.create = function(req, res, next) {
  var walletToSubmit = _.pick(req.body, [
    'id',
    'authToken',
    'mainData',
    'mainDataHash',
    'keychainData',
    'keychainDataHash'
  ]);

  wallet.create(walletToSubmit)
    .then (function(wallet) { 
      res.send({"status" : "success"}); 
    })
    .catch(validate.errors.InvalidHash, function(e) {
      res.status(400).send({
        "status": "fail",
        "field":  e.field,
        "code":   "invalid_hash"
      });
    })
    .catch(validate.errors.MissingField, function(e) {
      res.status(400).send({
        "status": "fail",
        "field":  e.field,
        "code":   "missing"
      });
    })
    .catch(errors.DuplicateRecord, function(e) {
      res.status(400).send({
        "status": "fail",
        "field":  "id",
        "code":   "already_taken"
      });
    })
    .catch(function(e) {
      next(e);
    });
};

wallets.update = function(req, res, next) {
  var id        = req.body.id;
  var authToken = req.body.authToken;
  var changes   = _.pick(req.body, [
    'mainData',
    'mainDataHash',
    'keychainData',
    'keychainDataHash',
  ]);

  wallet.update(id, authToken, changes)
    .then (function(wallet) { 
      res.send({"status" : "success"}); 
    })
    .catch(errors.RecordNotFound, function(e) {
      res.status(404).send({
        "status": "fail",
        "code":   "not_found"
      });
    })
    .catch(errors.Forbidden, function(e) {
      res.status(403).send({
        "status": "fail",
        "code":   "forbidden"
      });
    })
    .catch(validate.errors.InvalidHash, function(e) {
      res.status(400).send({
        "status": "fail",
        "field":  e.field,
        "code":   "invalid_hash"
      });
    })
    .catch(function(e) {
      next(e);
    });
};

wallets.replace = function(req, res, next) {
  var replaceArgs = _.at(req.body, 'oldId', 'oldAuthToken', 'newId', 'newAuthToken');

  wallet.replace.apply(null, replaceArgs)
    .then(function () {
      res.send({"status" : "success"}); 
    })
    .catch(errors.Forbidden, function(e) {
      res.status(403).send({
        "status": "fail",
        "code":   "forbidden"
      });
    })
    .catch(errors.RecordNotFound, function(e) {
      res.status(404).send({
        "status": "fail",
        "code":   "not_found"
      });
    })
    .catch(function(e) {
      next(e);
    });
};

wallets.recover = function(req, res, next) {
  var recoveryId = req.body.recoveryId;

  if (_.isEmpty(recoveryId)) {
    res.status(400).send({
      "status": "fail",
      "field":  "recoveryId",
      "code":   "missing"
    });
    return;
  }

  wallet.getByRecoveryId(recoveryId).then(function(wallet) {
    if(typeof wallet === "undefined") {
      res.status(404).send({ "status": "fail", "code": "not_found" });
    } else {
      res.send({
        "status" : "success",
        "data"   : wallet
      });
    }
  });
};

wallets.createRecoveryData = function(req, res, next) {
  var id        = req.body.id;
  var authToken = req.body.authToken;
  var changes   = _.pick(req.body, [
    'recoveryId',
    'recoveryData',
    'recoveryDataHash'
  ]);

  wallet.createRecovery(id, authToken, changes)
    .then (function(wallet) {
      res.send({"status" : "success"});
    })
    .catch(errors.Forbidden, function(e) {
      res.status(403).send({
        "status": "fail",
        "code":   "forbidden"
      });
    })
    .catch(validate.errors.InvalidHash, function(e) {
      res.status(400).send({
        "status": "fail",
        "field":  e.field,
        "code":   "invalid_hash"
      });
    })
    .catch(function(e) {
      next(e);
    });
};

wallets.markMigrated = function(req, res, next) {
  var id        = req.body.id;
  var authToken = req.body.authToken;

  wallet.markMigrated(id, authToken)
    .then (function(wallet) {
      res.send({"status" : "success"});
    })
    .catch(errors.Forbidden, function(e) {
      res.status(403).send({
        "status": "fail",
        "code":   "forbidden"
      });
    })
    .catch(errors.RecordNotFound, function(e) {
      res.status(404).send({
        "status": "fail",
        "code": "not_found"
      });
    })
    .catch(function(e) {
      next(e);
    });
};

