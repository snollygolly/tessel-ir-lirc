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
			// in the table, get the second column, and then the actual link
			const remoteName = $(elem).children("td").eq(1).children("a").prop("href");
			remotes.push(remoteName);
		}
	});
	console.log(`We found ${remotes.length} remotes for this OEM`);
	return remotes;
}

function searchAllRemotes(needle, haystack) {
	// initialize the search needle
	let searchNeedle = needle.toUpperCase();
	let i = 0;
	while (i < needle.length) {
		// set the search pattern
		const needlePattern = new RegExp(`^${searchNeedle}.*`, "g");
		// filter through the array
		const matches = haystack.filter((item) => {
			return item.match(needlePattern);
		});
		if (matches.length > 0) {
			// just give us the first result off the top
			const match = matches.shift();
			// the needle (or modified needle) was found in the haystack
			console.log(`Found ${match} in haystack using ${searchNeedle} as needle`);
			return match;
		}
		searchNeedle = searchNeedle.substr(0, searchNeedle.length - 1);
		i++;
	}
	console.log(`No suitable remote found in OEM listing`);
	return false;
}

function* getRemote(oem, model) {
	// first get the page
	console.log(`Requesting ${LIRC_URL}/${oem}/${model}`);
	const rawPage = yield rp(`${LIRC_URL}/${oem}/${model}`);
	console.log(`Found /${oem}/${model}/`);
	const remote = parseRemote(rawPage);
	const verified = verifyRemote(remote);
	if (verified === false) {
		// this remote isn't valid
		return false;
	}
	return remote;
}

function parseRemote(raw) {
	// match 2 spaces, then the key, then 1 or more spaces, then the value
	// for values that are similar to "xxxx		xxxx", do a split and shift/pop
	const propertyPattern = /^ {2}([\w_]+?)(?: +)(.+)$/;
	// TODO: this pattern won't picks up two properties, fix that!
	const codePattern = /^ {10}([^ ]+?)(?: +)([^ ]+?)(?: .+)?$/;
	const rawArr = raw.split("\n");
	const remoteObj = {};
	console.log(`Found ${rawArr.length} lines in remote file`);
	for (const line of rawArr) {
		// check for comments on this line, we don't care about these
		if (line.indexOf("#") === 0) {continue;}
		// check to see if this is a property value
		const propertyMatch = propertyPattern.exec(line);
		if (propertyMatch !== null) {
			// there's a match, and this is a property
			// see if we can split it
			const splitMatch = propertyMatch[2].split(" ");
			// xxxx xxxx would split into 3
			if (splitMatch.length > 2) {
				const onVal = splitMatch.shift();
				const offVal = splitMatch.pop();
				remoteObj[propertyMatch[1]] = [onVal, offVal];
			} else {
				remoteObj[propertyMatch[1]] = propertyMatch[2];
			}
			continue;
		}
		// check to see if this is a code value
		const codeMatch = codePattern.exec(line);
		if (codeMatch !== null) {
			// this is a code match
			// TODO: this doesn't handle two property values, but it needs to
			remoteObj[codeMatch[1]] = codeMatch[2];
			continue;
		}
	}
	console.log(`Returning parsed remote object named ${remoteObj.name}`);
	return remoteObj;
}

function verifyRemote(remote) {
	// make sure that the remote has all required properties
	// check to make sure it has a header
	if (!remote.header) {return false;}
	// check if it's an array
	if (remote.header.length < 2) {return false;}
 	// check to see if there's a one
	if (!remote.one) {return false;}
	// see if it's an array
	if (remote.one.length < 2) {return false;}
	// check to see if there's a zero
	if (!remote.zero) {return false;}
	// see if it's an array
	if (remote.zero.length < 2) {return false;}
	// check to see if there's a length
	if (!remote.bits) {return false;}
	return true;
}

function get16BitsComplement(number) {
	return number < 0 ? (65536 + number) : number;
};

function generateBuffer(remote) {
	const headerBytes = [remote.header[0], get16BitsComplement(remote.header[1] * -1)];
	const oneOnDuration = remote.one[0];
	const zeroOnDuration = remote.zero[0];
	const offDuration = get16BitsComplement(remote.zero[1]);
	// TODO: figure this out?
	const repeatDuration = get16BitsComplement(-25700);
	const bodyLen = remote.bits;


	const headerBuf = new Buffer(4);
	headerBuf.writeUInt16BE(headerBytes[0], 0);
	headerBuf.writeUInt16BE(headerBytes[1], 2);

	// multiply by 4 b/c we're sending int16s (2 8-byte words) for each duration
	// and there is both an on and an off duration
	const bodyBuf = new Buffer(bodyLen * 2 * 2);

	for (let i = 0; i < bodyLen; i++) {
		// If the next bit is a 1
		if ((hexValue >> (bodyLen - i - 1)) & 1) {
			// Write the one ON duration
			bodyBuf.writeUInt16BE(oneOnDuration, i * 4);
		} else {
			// Write the zero ON duration
			bodyBuf.writeUInt16BE(zeroOnDuration, i * 4);
		}

		// Write the standard OFF duration
		bodyBuf.writeUInt16BE(offDuration, (i * 4) + 2);

	}
	bodyBuf.writeUInt16BE(repeatDuration, bodyBuf.length - 2);

	const packet = Buffer.concat([headerBuf, bodyBuf]);
	return Buffer.concat([packet, packet, packet]);
};

co(function* send() {
	const oem = "pioneer";
	const model = "xxd3132";
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
	// attempt to find the nearest match for this model number
	const match = searchAllRemotes(model, listing);
	if (match === false) {
		throw new Error("No remote matching that model number found");
	}
	// fetch the parsed remote object
	const remote = yield getRemote(oem, match);
	if (remote === false) {
		// TODO: a more descriptive error would be great here
		throw new Error("There was a problem with that remote file");
	}
	console.log(JSON.stringify(remote));
}).catch(onerror);

function onerror(err) {
	// log any uncaught errors
	// co will not throw any errors you do not handle!!!
	// HANDLE ALL YOUR ERRORS!!!
	console.error(err.stack);
}
