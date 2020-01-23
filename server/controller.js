const express = require('express');
const router = express.Router();
var mysql = require('mysql');
const fs = require("fs");
const path = require('path');
const https = require('http');
var multer = require('multer');

//ID encriptar usar como el evento de ese usuario.
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, 'files/');
	},
	filename: function (req, file, cb) {
		var name = file.originalname
		if (name.length > 84) {
			var diff = name.length - 84
			var namef = name.substring(diff)
		} else {
			namef = file.originalname
		}
		cb(null, + new Date() + '_T_' + namef);
	},

});

var upload = multer({
	storage: storage
});

router.post('/upload_file',
	(req, res, next) => {
		upload.single('file')(req, res, function (err) {
			if (err) {
				next(err);
			} else {
				next();
			}
		})
	}, (req, res, next) => {
		var { file } = req;
		res.status(200).json(file);	
	}
);

module.exports = router;
