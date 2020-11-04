const express = require('express');
const router = express.Router();
var mysql = require('mysql');
const fs = require("fs");
var jwt = require('jsonwebtoken');
var bcrypt = require('bcryptjs');
const nodemailer = require("nodemailer");
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);
var async = require("async");
const path = require('path');
const https = require('http');
var multer = require('multer');
var XLSX = require('xlsx');

var con = mysql.createPool({
	connectionLimit: 20,
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_SCHEMA,
	insecureAuth: true,
	multipleStatements: true
});

var credencial_paq = 'I.MOBILE';

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

function generate_pin(p_type) {
	var list = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

	var selected_type = p_type[Math.floor(Math.random() * p_type.length)];

	var pin =
		selected_type.ini_correlat +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length))
		;

	return {
		pin: pin,
		selected_type: selected_type
	};
}

function generate_mt_id() {
	var list = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

	var pin =
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length)) +
		list.charAt(Math.floor(Math.random() * list.length))
		;

	return pin;
}

function send_message(message) {
	var gateway = 'smppgwtigo';
	var remitentegw = '8472';
	var msisdn = '88888888';
	var username = "istmouser";
	var password = "s3cr3t209s78na8971m2398k10";

	var request =
		"http://impactmobilehn.com:13013/cgi-bin/sendsms?" +
		"smsc=" + gateway +
		"&username=" + username +
		"&password=" + password +
		"&from=" + remitentegw +
		"&to=" + msisdn +
		"&text=" + encodeURI(message)
		;
		console.log(request);

	https.get(request, (resp) => {
		let data = '';

		resp.on('data', (chunk) => {
			data += chunk;
		});

		resp.on('end', () => {
			console.log('end')
			return true;
		});

	}).on("error", (err) => {
		console.log("Error: " + err.message);
	});
}

function get_message_count(size) {
	if (Math.ceil(size / 160) <= 1) {
		return 1;
	} else {
		return Math.ceil(size / 153);
	}
}

function send_gratitude_message(number) {
	var message = 'Felicidades tu Tarjeta de Debito Ficohsa te ha acreditado a tu celular un PaqueTigo, consulta #125#';
	var mt_id = generate_mt_id() + (new Date().toISOString());

	var gateway = 'smppgwtigo';
	var remitentegw = '50494394420';
	var msisdn = "504" + number;
	var username = "istmouser";
	var password = "s3cr3t209s78na8971m2398k10";
	var dlrURL = "http://10.10.3.2:8099/dlr.php?dlr=%d&answer=%A&to=%p&ts=%T&smsID=" + mt_id;

	var request =
		"http://impactmobilehn.com:13013/cgi-bin/sendsms?" +
		"smsc=" + gateway +
		"&username=" + username +
		"&password=" + password +
		"&from=" + remitentegw +
		"&to=" + msisdn +
		"&text=" + encodeURI(message) +
		"&dlr-mask=31&dlr-url=" + encodeURI(dlrURL)
		;

	console.log(request);

	https.get(request, (resp) => {
		let data = '';

		resp.on('data', (chunk) => {
			data += chunk;
		});

		resp.on('end', () => {
			return true;
		});

	}).on("error", (err) => {
		console.log("Error: " + err.message);
	});
}

function read_file(filename, callback) {
	var workbook = XLSX.readFile('files/' + filename);
	var sheet_name_list = workbook.SheetNames;

	callback(XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]));
}

router.get('/test_sms', (req, res, next) => {
	send_gratitude_message(req.query.number);
});


router.get('/test', (req, res, next) => {
	con.query('SELECT * FROM smsreseller_ptigos_tipo;', (err, res, fields) => {
		console.log(res);
	});
});


router.post('/upload_file',
	// Upload File
	(req, res, next) => {
		upload.single('file')(req, res, function (err) {
			if (err) {
				next(err);
			} else {
				next();
			}
		})
	},
	// Read & extract numbers
	(req, res, next) => {
		var { file } = req;
		read_file(file.filename, (data) => {
			req.numbers = data.map(value => (value[req.body.col_name] + "").substring(3, 11));
			next();
		});
	},
	// Select P-Types
	(req, res, next) => {
		var query =
			"SELECT * " +
			"FROM smsreseller_ptigos_tipo " +
			";"
			;

		con.query(query, (err, result, fields) => {
			if (err) {
				next(err);
			} else {
				req.p_type = result;
				next();
			}
		});
	},
	// Format numbers
	(req, res, next) => {
		var { p_type } = req;
		var query_p_tigo = [];
		var query_status3 = [];

		var remitentegw = '8472';
		var msisdn = '88888888';
		var reseller_id = 10;
		var salida_operador = 1;
		var id_usuario = 10;

		var gratitude_remitentegw = '8472';
		var gratitude_reseller_id = 347;
		var gratitude_salida_operador = 1;
		var gratitude_id_usuario = 1258;
		var gratitude_message = 'Felicidades tu Tarjeta de Debito Ficohsa te ha acreditado a tu celular un PaqueTigo, consulta #125#';

		var message_amount = 0;

		for (let i = 0; i < req.numbers.length; i++) {
			var generated_pin = generate_pin(p_type);
			var mt_id = generate_mt_id() + (new Date().toISOString());

			var gratitude_msisdn = '504' + req.numbers[i];
			var gratitude_mt_id = generate_mt_id() + (new Date().toISOString());

			var message =
				generated_pin.selected_type.tipo_paq + ',' +
				req.numbers[i] + ',' +
				generated_pin.pin + ',' +
				credencial_paq
				;

			query_status3.push(
				"(" +
				0 + "," +
				"'" + mt_id + "'," +
				"'" + msisdn + "'," +
				"'" + reseller_id + "'," +
				"'" + remitentegw + "'," +
				"'Delivered'" + "," +
				3 + "," +
				0 + "," +
				"'" + message + "'," +
				1 + "," +
				"'" + salida_operador + "'," +
				0 + "," +
				"'" + id_usuario + "'," +
				0 + "," +
				0 +
				")"
			);

			query_status3.push(
				"(" +
				0 + "," +
				"'" + gratitude_mt_id + "'," +
				"'" + gratitude_msisdn + "'," +
				"'" + gratitude_reseller_id + "'," +
				"'" + gratitude_remitentegw + "'," +
				"'Delivered'" + "," +
				3 + "," +
				0 + "," +
				"'" + gratitude_message + "'," +
				1 + "," +
				"'" + gratitude_salida_operador + "'," +
				0 + "," +
				"'" + gratitude_id_usuario + "'," +
				0 + "," +
				0 +
				")"
			);

			query_p_tigo.push(
				"(" +
				'NOW(),' +
				"'" + req.numbers[i] + "'," +
				"'" + generated_pin.pin + "'," +
				"'" + generated_pin.selected_type.id + "'," +
				'1' +
				")"
			);

			message_amount += get_message_count(gratitude_message.length);;

			send_message(message);
			send_gratitude_message(req.numbers[i]);
		}
		req.query_p_tigo = query_p_tigo;
		req.query_status3 = query_status3;
		req.message_amount = message_amount;
		req.reseller_id = reseller_id;
		next();
	},
	// Query
	(req, res, next) => {
		var { query_p_tigo, query_status3, message_amount, reseller_id } = req;

		var query =
			//  Status3
			"INSERT INTO smsreseller_mt_status3 " +
			"(env_id, mt_id, mt_cellphone, smsadmin_resellers_id, short_shortcode, status_desc, mt_status, smsreseller_subgrupos_id, mt_text, largo, id_operadora, id_calendarizado, id_usuario, id_contacto, id_empresa) " +
			"VALUES " +
			query_status3.join(',') + " " +
			"; " +
			// P-Tigos
			"INSERT INTO smsreseller_ptigos " +
			"(fecha_acred, ptigo_num, id_pin, id_tipo_paq, estado) " +
			"VALUES " +
			query_p_tigo.join(',') + " " +
			"; " +
			// Update Estadística Mensaje
			"UPDATE smsreseller_estadisticamensaje " +
			"SET " +
			"mensajes_enviados = mensajes_enviados + " + message_amount + ", " +
			"fecha_actualizacion = NOW(), " +
			"enviados_tigo = enviados_tigo + " + message_amount + " " +
			"WHERE " +
			"svr_reseller_id = " + reseller_id + " " +
			"AND mes = MONTH(NOW()) " +
			"AND anio = YEAR(NOW()) " +
			"; " +
			// Update Estadística Diaria
			"UPDATE smsreseller_estadisticadiaria " +
			"SET sms_enviados = sms_enviados + " + message_amount + " " +
			"WHERE reseller_id = " + reseller_id + " " +
			"AND dia = DAY(NOW()) " +
			"AND mes = MONTH(NOW()) " +
			"AND anio = YEAR(NOW()) " +
			";"
			;

		con.query(query, (err, result, fields) => {
			if (err) {
				next(err);
			} else {
				res.status(200).json(result);
			}
		});
	}
);

module.exports = router;