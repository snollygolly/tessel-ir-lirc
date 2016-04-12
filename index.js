"use strict";

const rp = require("request-promise");
const cheerio = require("cheerio");
const co = require("co");

const LIRC_URL = "http://lirc.sourceforge.net/remotes";

function* getOEMLink(oem) {
	// first get the page
	const rawPage = yield rp(LIRC_URL);
	// do some filtering on the OEM
	const lowerCaseOEM = oem.toLowerCase();
	// replace all spaces with underscores, everything else should be good
	const filteredOEM = lowerCaseOEM.replace(/ /g, "_");
	// set the pattern [ "oem/" ]
	const oemPattern = new RegExp(`"${filteredOEM}\\/"`, "g");
	// check if it exists in the page
	if (oemPattern.test(rawPage) === true) {
		console.log(`The OEM ${filteredOEM} is in the page!`);
		return filteredOEM;
	}
	console.log(`The OEM ${filteredOEM} is not in the page!`);
	return false;
}

function* getAllRemotes(oem) {
	// init the var
	const remotes = [];
	// first get the page
	const rawPage = yield rp(`${LIRC_URL}/${oem}/`);
	const $ = cheerio.load(rawPage);
	$("tr").each((i, elem) => {
		// this is each row, we need the second column
		const tableLength = $(elem).children("td").length;
		if (tableLength > 0) {
			const remoteName = $(elem).children("td").eq(1).children("a").prop("href");
			remotes.push(remoteName);
		}
	});
	console.log(`We found ${remotes.length} remotes for this OEM`);
	return remotes;
}

co(function* send() {
	const oem = "pioneer";
	// first see if you can get the OEM
	const result = yield getOEMLink(oem);
	if (result === false) {
		throw new Error("No OEM found");
	}
	// get all the remotes on that listing page
	const listing = yield getAllRemotes(result);
	if (listing.length === 0) {
		throw new Error("No remotes found");
	}
}).catch(onerror);

function onerror(err) {
	// log any uncaught errors
	// co will not throw any errors you do not handle!!!
	// HANDLE ALL YOUR ERRORS!!!
	console.error(err.stack);
}
