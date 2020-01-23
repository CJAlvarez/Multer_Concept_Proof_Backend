const express = require('express');
const router = express.Router();
var mysql = require('mysql');
const fs = require("fs");
const path = require('path');
const https = require('http');
const { Sequelize, Model, DataTypes } = require('sequelize');

// INIT MySQL
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

// Init Sequelize
var sequelize = new Sequelize(
	process.env.DB_SCHEMA,
	process.env.DB_USER,
	process.env.DB_PASS,
	{
		host: process.env.DB_HOST,
		dialect: 'mysql'
	}
);

// DEFINE MODELS
class Current_Exchange_Rates extends Model { };
class History_Exchange_Rates extends Model { };
class Currencies extends Model { };

var sequelize_first_init = false;

/**
 * @name convert
 * @desc Calculates the uer, usd, hnl values of each currency.
 * @param {JSON} rates 
 * @param {Number} amount 
 */
function convert(rates, amount) {
	var usd = rates["USD"];
	var hnl = rates["HNL"];
	var eur = rates["EUR"];

	var query = {};

	for (var i in rates) {
		var current = rates[i];

		var usd_total = 0;
		var hnl_total = 0;
		var eur_total = 0;

		usd_total = amount * (1 / current) * usd;
		hnl_total = amount * (1 / current) * hnl;
		eur_total = amount * (1 / current) * eur;

		query[i] = {
			eur: eur_total.toFixed(12),
			usd: usd_total.toFixed(12),
			hnl: hnl_total.toFixed(12)
		};
	}
	return query;
}

/**
 * @name timer
 * @desc Timer.
 */
function timer() {
	console.log("\nSTART TIMER")
	var date = new Date();
	date = new Date(date.getFullYear(), date.getMonth(), (date.getDate() + 1), 1, 0, 0, 0);
	setTimeout(() => {
		setInterval(() => update_exchange_rate(result => { console.log(result); }, error => { console.log(error); }), 812400000);
	}, date.getTime() - new Date().getTime());
}

/**
 * @name insert_currencies
 * @desc Inserts the current currencies.
 * @param {Function} res 
 * @param {Function} next 
 */
function insert_currencies(res, next) {
	https.get('http://data.fixer.io/api/symbols?access_key=' + process.env.ACCESS_KEY, (resp) => {
		let data = '';

		// A chunk of data has been recieved.
		resp.on('data', (chunk) => {
			data += chunk;
		});

		// The whole response has been received. Print out the result.
		resp.on('end', () => {
			var currencies = JSON.parse(data)["symbols"];
			var query = "";
			for (var i in currencies) {
				query += "("
					+ "'" + i + "',"
					+ "'" + currencies[i] + "',"
					+ "NULL,"
					+ "NOW(),"
					+ "NOW()"
					+ "),"
					;
			}

			query = "INSERT INTO currencies (currency, description, symbol, created_at, updated_at) VALUES " + query.substring(0, query.length - 1) + ";";

			con.query(query, (error, result, fields) => {
				if (error) {
					next(error);
				} else {
					res("INIT CURRENCIES");
				}
			});
		});

	}).on("error", (err) => {
		console.log("Error: " + err.message);
	});
}

/**
 * @name insert_exchange_rate
 * @desc Inserts the current exchage rates.
 * @param {Function} res 
 * @param {Function} next 
 */
function insert_exchange_rate(res, next) {
	var query = "SELECT * FROM currencies;";

	con.query(query, (error, result, fields) => {

		https.get('http://data.fixer.io/api/latest?access_key=' + process.env.ACCESS_KEY, (resp) => {
			let data = '';

			// A chunk of data has been recieved.
			resp.on('data', (chunk) => {
				data += chunk;
			});

			// The whole response has been received. Print out the result.
			resp.on('end', () => {
				var currencies = result;
				var rates = convert(JSON.parse(data)["rates"], 1);

				var insert_query = "";
				var insert_current_query = "";
				var insert_history_query = "";

				currencies.forEach(currency => {
					insert_current_query +=
						"("
						+ currency.id + ","
						+ rates[currency.currency].eur + ","
						+ rates[currency.currency].usd + ","
						+ rates[currency.currency].hnl + ","
						+ "NOW(),"
						+ "NOW()"
						+ "),"
						;

					insert_history_query +=
						"("
						+ currency.id + ","
						+ rates[currency.currency].eur + ","
						+ rates[currency.currency].usd + ","
						+ rates[currency.currency].hnl + ","
						+ "NOW()"
						+ "),"
						;
				});

				insert_query = "INSERT INTO current_exchange_rates (id_currency, eur, usd, hnl, created_at, updated_at) VALUES " + insert_current_query.substring(0, insert_current_query.length - 1) + ";"
					+ "INSERT INTO history_exchange_rates (id_currency, eur, usd, hnl, created_at) VALUES " + insert_history_query.substring(0, insert_history_query.length - 1) + ";"

				con.query(insert_query, (insert_error, insert_result, insert_fields) => {
					if (insert_error) {
						next(insert_error);
					} else {
						res("INIT EXCHANGE RATES");
					}
				});

			});

		}).on("error", (err) => {
			console.log("Error: " + err.message);
		});
	});
}

/**
 * @name update_exchange_rate
 * @desc Updates the current exchage rates.
 * @param {Function} res 
 * @param {Function} next 
 */
function update_exchange_rate(res, next) {
	var query = "SELECT * FROM currencies;";

	con.query(query, (error, result, fields) => {

		https.get('http://data.fixer.io/api/latest?access_key=' + process.env.ACCESS_KEY, (resp) => {
			let data = '';

			// A chunk of data has been recieved.
			resp.on('data', (chunk) => {
				data += chunk;
			});

			// The whole response has been received. Print out the result.
			resp.on('end', () => {
				var currencies = result;
				var rates = convert(JSON.parse(data)["rates"], 1);

				var update_query = "";
				var update_current_query = "";
				var update_history_query = "";

				currencies.forEach(currency => {
					update_history_query +=
						"("
						+ currency.id + ","
						+ rates[currency.currency].eur + ","
						+ rates[currency.currency].usd + ","
						+ rates[currency.currency].hnl + ","
						+ "NOW()"
						+ "),"
						;

					update_current_query +=
						"UPDATE current_exchange_rates SET "
						+ "eur = " + rates[currency.currency].eur + ","
						+ "usd = " + rates[currency.currency].usd + ","
						+ "hnl = " + rates[currency.currency].hnl + ","
						+ "updated_at = NOW() "
						+ "WHERE "
						+ "id_currency = " + currency.id
						+ ";"
						;
				});

				update_query = update_current_query
					+ "INSERT INTO history_exchange_rates (id_currency, eur, usd, hnl, created_at) VALUES " + update_history_query.substring(0, update_history_query.length - 1) + ";"

				con.query(update_query, (update_error, update_result, update_fields) => {
					if (update_error) {
						next(update_error);
					} else {
						res("\nUPDATE EXCHANGE RATES");
					}
				});

			});

		}).on("error", (err) => {
			console.log("Error: " + err.message);
		});
	});
}

/**
 * @name validateDB
 * @desc Validates the DB
 */
function validateDB() {
	sequelize
		.authenticate()
		.then(() => {
			// INIT MODELS
			Current_Exchange_Rates.init({
				id_currency: { type: DataTypes.INTEGER, allowNull: false },
				eur: { type: DataTypes.DECIMAL(27, 12), allowNull: false },
				usd: { type: DataTypes.DECIMAL(27, 12), allowNull: false },
				hnl: { type: DataTypes.DECIMAL(27, 12), allowNull: false },
				created_at: { type: DataTypes.DATEONLY, allowNull: false },
				updated_at: { type: DataTypes.DATEONLY, allowNull: false }
			}, {
				sequelize,
				modelName: 'current_exchange_rates',
				timestamps: false
			});

			History_Exchange_Rates.init({
				id_currency: { type: DataTypes.INTEGER, allowNull: false },
				eur: { type: DataTypes.DECIMAL(27, 12), allowNull: false },
				usd: { type: DataTypes.DECIMAL(27, 12), allowNull: false },
				hnl: { type: DataTypes.DECIMAL(27, 12), allowNull: false },
				created_at: { type: DataTypes.DATEONLY, allowNull: false }
			}, {
				sequelize,
				modelName: 'history_exchange_rates',
				timestamps: false
			});

			Currencies.init({
				currency: { type: DataTypes.STRING(3), allowNull: false },
				symbol: { type: DataTypes.STRING(5), allowNull: true },
				description: { type: DataTypes.STRING(50), allowNull: false },
				created_at: { type: DataTypes.DATEONLY, allowNull: false },
				updated_at: { type: DataTypes.DATEONLY, allowNull: false }
			}, {
				sequelize,
				modelName: 'currencies',
				timestamps: false
			});

			// SYNC MODELS
			sequelize.sync().then(() => {

				if (sequelize_first_init) {

					insert_currencies(
						result => {
							insert_exchange_rate(
								result => {
									console.log(result);
									timer();
								},
								error => {
									console.log(error);
								}
							);
						},
						error => {
							console.log(error);
						}
					);
				}
			});

		})
		.catch(err => {
			if ((err + "").includes("Unknown database")) {

				// INIT SEQUELIZE WITHOUT DB
				sequelize = new Sequelize(
					"",
					process.env.DB_USER,
					process.env.DB_PASS,
					{
						host: process.env.DB_HOST,
						dialect: 'mysql'
					}
				);

				// CREATE DB
				sequelize.query("CREATE DATABASE IF NOT EXISTS `" + process.env.DB_SCHEMA + "`;").then(() => {

					// INIT SEQUELIZE
					sequelize = new Sequelize(
						process.env.DB_SCHEMA,
						process.env.DB_USER,
						process.env.DB_PASS,
						{
							host: process.env.DB_HOST,
							dialect: 'mysql'
						}
					);
					sequelize_first_init = true;
					// VALIDATE AGAIN
					validateDB();
				});
			}
		});
}

/**
 * @name /get_currencies
 * @desc Gets the currencies.
*/
router.get('/get_currencies', (req, res, next) => {
	var query = "SELECT * FROM currencies;";

	con.query(query, function (err, result, fields) {
		if (err) {
			next(err);
		} else {
			res.status(200).json(result);
		}
	});
});

/**
 * @name /get_current_exchange_rate
 * @desc Gets the current exchange rate.
*/
router.get('/get_current_exchange_rate', (req, res, next) => {
	const { currency } = req.query;

	var values = [
		currency ? currency.toUpperCase() : ''
	];

	var query =
		"SELECT current_exchange_rates.*, currencies.currency, currencies.description, currencies.symbol "
		+ "FROM current_exchange_rates "
		+ "LEFT JOIN currencies "
		+ "ON current_exchange_rates.id_currency = currencies.id "
		+ "WHERE "
		+ "currencies.currency = ? "
		+ ";"
		;

	con.query(query, values, function (err, result, fields) {
		if (err) {
			next(err);
		} else {
			res.status(200).json(result);
		}
	});
});

/**
 * @name /get_past_exchange_rate
 * @desc Gets the exchange rate in the history.
*/
router.get('/get_past_exchange_rate', (req, res, next) => {
	const { currency, date } = req.query;

	var current_date = new Date();
	current_date.setHours(0, 0, 0, 0);

	var values = [
		date ? date : current_date,
		currency ? currency.toUpperCase() : ''
	];

	var query =
		"SELECT history_exchange_rates.*, currencies.currency, currencies.description, currencies.symbol "
		+ "FROM history_exchange_rates "
		+ "LEFT JOIN currencies "
		+ "ON history_exchange_rates.id_currency = currencies.id "
		+ "WHERE "
		+ "history_exchange_rates.created_at = ? "
		+ "AND currencies.currency = ? "
		+ ";"
		;

	con.query(query, values, function (err, result, fields) {
		if (err) {
			next(err);
		} else {
			res.status(200).json(result);
		}
	});
});

/**
 * @name /get_current_exchange_rate_convert_local
 * @desc Gets the current exchange rate convertion to (eur, usd, hnl).
*/
router.get('/get_current_exchange_rate_convert_local', (req, res, next) => {
	const { currency, amount, eur, usd, hnl } = req.query;

	var values = [
		...eur ? [amount, amount] : [],
		...usd ? [amount, amount] : [],
		...hnl ? [amount, amount] : [],
		currency ? currency.toUpperCase() : ''
	];

	var query =
		"SELECT "
		+ (eur ? "ROUND(current_exchange_rates.eur * ?, 6) AS eur, " : "")
		+ (eur ? "CONCAT('€. ', ROUND(current_exchange_rates.eur * ?, 6)) AS eur_literal, " : "")
		+ (usd ? "ROUND(current_exchange_rates.usd * ?, 6) AS usd, " : "")
		+ (usd ? "CONCAT('$. ', ROUND(current_exchange_rates.usd * ?, 6)) AS usd_literal, " : "")
		+ (hnl ? "ROUND(current_exchange_rates.hnl * ?, 6) AS hnl, " : "")
		+ (hnl ? "CONCAT('L. ', ROUND(current_exchange_rates.hnl * ?, 6)) AS hnl_literal, " : "")
		+ "currencies.currency, "
		+ "currencies.description, "
		+ "currencies.symbol "
		+ "FROM current_exchange_rates "
		+ "LEFT JOIN currencies "
		+ "ON current_exchange_rates.id_currency = currencies.id "
		+ "WHERE "
		+ "currencies.currency = ? "
		+ ";"
		;

	con.query(query, values, function (err, result, fields) {
		if (err) {
			next(err);
		} else {
			res.status(200).json(result);
		}
	});
});

/**
 * @name /get_current_exchange_rate_convert
 * @desc Gets the current exchange rate convertion.
*/
router.get('/get_current_exchange_rate_convert', (req, res, next) => {
	const { from_currency, amount, to_currency } = req.query;

	var values = [
		from_currency ? from_currency.toUpperCase() : '',
		to_currency ? to_currency.toUpperCase() : ''
	];

	var query =
		//	From Currency
		"SELECT "
		+ "current_exchange_rates.eur "
		+ "FROM current_exchange_rates "
		+ "LEFT JOIN currencies "
		+ "ON current_exchange_rates.id_currency = currencies.id "
		+ "WHERE "
		+ "currencies.currency = ? "
		+ ";"
		//	To Currency
		+ "SELECT "
		+ "current_exchange_rates.eur, "
		+ "currencies.currency, "
		+ "currencies.description, "
		+ "currencies.symbol "
		+ "FROM current_exchange_rates "
		+ "LEFT JOIN currencies "
		+ "ON current_exchange_rates.id_currency = currencies.id "
		+ "WHERE "
		+ "currencies.currency = ? "
		+ ";"
		;

	con.query(query, values, function (err, result, fields) {
		if (err) {
			next(err);
		} else {
			var total = 0.0;
			total = parseFloat((amount * result[0][0]["eur"] * (1 / result[1][0]["eur"])).toFixed(6));
			res.status(200).json({
				value: total,
				description: result[1][0]["description"],
				currency: result[1][0]["currency"],
				symbol: result[1][0]["symbol"],
				literal: (result[1][0]["symbol"] ? (result[1][0]["symbol"] + ".") : result[1][0]["currency"]) + " " + total
			});
		}
	});
});

/**
 * @name /get_past_exchange_rate_convert_local
 * @desc Gets the past exchange rate convertion to (eur, usd, hnl).
*/
router.get('/get_past_exchange_rate_convert_local', (req, res, next) => {
	const { currency, amount, eur, usd, hnl, date } = req.query;

	var current_date = new Date();
	current_date.setHours(0, 0, 0, 0);

	var values = [
		...eur ? [amount, amount] : [],
		...usd ? [amount, amount] : [],
		...hnl ? [amount, amount] : [],
		date ? date : current_date,
		currency ? currency.toUpperCase() : ''
	];

	var query =
		"SELECT "
		+ (eur ? "ROUND(history_exchange_rates.eur * ?, 6) AS eur, " : "")
		+ (eur ? "CONCAT('€. ', ROUND(history_exchange_rates.eur * ?, 6)) AS eur_literal, " : "")
		+ (usd ? "ROUND(history_exchange_rates.usd * ?, 6) AS usd, " : "")
		+ (usd ? "CONCAT('$. ', ROUND(history_exchange_rates.usd * ?, 6)) AS usd_literal, " : "")
		+ (hnl ? "ROUND(history_exchange_rates.hnl * ?, 6) AS hnl, " : "")
		+ (hnl ? "CONCAT('L. ', ROUND(history_exchange_rates.hnl * ?, 6)) AS hnl_literal, " : "")
		+ "currencies.currency, "
		+ "currencies.description, "
		+ "currencies.symbol "
		+ "FROM history_exchange_rates "
		+ "LEFT JOIN currencies "
		+ "ON history_exchange_rates.id_currency = currencies.id "
		+ "WHERE "
		+ "history_exchange_rates.created_at = ? "
		+ "AND currencies.currency = ? "
		+ ";"
		;

	con.query(query, values, function (err, result, fields) {
		if (err) {
			next(err);
		} else {
			res.status(200).json(result);
		}
	});
});

/**
 * @name /get_past_exchange_rate_convert
 * @desc Gets the past exchange rate convertion.
*/
router.get('/get_past_exchange_rate_convert', (req, res, next) => {
	const { from_currency, amount, to_currency, date } = req.query;

	var current_date = new Date();
	current_date.setHours(0, 0, 0, 0);

	var values = [
		date ? date : current_date,
		from_currency ? from_currency.toUpperCase() : '',
		date ? date : current_date,
		to_currency ? to_currency.toUpperCase() : ''
	];

	var query =
		//	From Currency
		"SELECT "
		+ "current_exchange_rates.eur "
		+ "FROM current_exchange_rates "
		+ "LEFT JOIN currencies "
		+ "ON current_exchange_rates.id_currency = currencies.id "
		+ "WHERE "
		+ "history_exchange_rates.created_at = ? "
		+ "AND currencies.currency = ? "
		+ ";"
		//	To Currency
		+ "SELECT "
		+ "current_exchange_rates.eur, "
		+ "currencies.currency, "
		+ "currencies.description, "
		+ "currencies.symbol "
		+ "FROM current_exchange_rates "
		+ "LEFT JOIN currencies "
		+ "ON current_exchange_rates.id_currency = currencies.id "
		+ "WHERE "
		+ "history_exchange_rates.created_at = ? "
		+ "AND currencies.currency = ? "
		+ ";"
		;

	con.query(query, values, function (err, result, fields) {
		if (err) {
			next(err);
		} else {
			var total = 0.0;
			total = parseFloat((amount * result[0][0]["eur"] * (1 / result[1][0]["eur"])).toFixed(6));
			res.status(200).json({
				value: total,
				description: result[1][0]["description"],
				currency: result[1][0]["currency"],
				symbol: result[1][0]["symbol"],
				literal: (result[1][0]["symbol"] ? (result[1][0]["symbol"] + ".") : result[1][0]["currency"]) + " " + total
			});
		}
	});
});

// Validate DB
validateDB();

module.exports = router;
