// Parses the development applications at the South Australian City of Tea Tree Gully web site and
// places them in a database.
//
// Michael Bone
// 5th August 2018

"use strict";

import * as cheerio from "cheerio";
import * as request from "request-promise-native";
import * as sqlite3 from "sqlite3";
import * as moment from "moment";

sqlite3.verbose();

const DevelopmentApplicationMainUrl = "https://www.ecouncil.teatreegully.sa.gov.au/eservice/dialog/daEnquiryInit.do?nodeNum=131612";
const DevelopmentApplicationSearchUrl = "https://www.ecouncil.teatreegully.sa.gov.au/eservice/dialog/daEnquiry.do?number=&lodgeRangeType=on&dateFrom={0}&dateTo={1}&detDateFromString=&detDateToString=&streetName=&suburb=0&unitNum=&houseNum=0%0D%0A%09%09%09%09%09&planNumber=&strataPlan=&lotNumber=&propertyName=&searchMode=A&submitButton=Search";
const CommentUrl = "mailto:customerservice@cttg.sa.gov.au";

// Sets up an sqlite database.

async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        let database = new sqlite3.Database("data.sqlite");
        database.serialize(() => {
            database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [comment_url] text, [date_scraped] text, [date_received] text, [on_notice_from] text, [on_notice_to] text)");
            resolve(database);
        });
    });
}

// Inserts a row in the database if it does not already exist.

async function insertRow(database, developmentApplication) {
    return new Promise((resolve, reject) => {
        let sqlStatement = database.prepare("insert or ignore into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        sqlStatement.run([
            developmentApplication.applicationNumber,
            developmentApplication.address,
            developmentApplication.reason,
            developmentApplication.informationUrl,
            developmentApplication.commentUrl,
            developmentApplication.scrapeDate,
            developmentApplication.receivedDate,
            null,
            null
        ], function(error, row) {
            if (error) {
                console.error(error);
                reject(error);
            } else {
                if (this.changes > 0)
                    console.log(`    Inserted: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" into the database.`);
                else
                    console.log(`    Skipped: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" because it was already present in the database.`);
                sqlStatement.finalize();  // releases any locks
                resolve(row);
            }
        });
    });
}

// Parses the development applications.

async function main() {
    // Ensure that the database exists.

    let database = await initializeDatabase();

    // Retrieve the main page.

    console.log(`Retrieving page: ${DevelopmentApplicationMainUrl}`);
    let jar = request.jar();  // this cookie jar will end up containing the JSESSIONID_live cookie after the first request; the cookie is required for the second request
    await request({ url: DevelopmentApplicationMainUrl, jar: jar });

    // Retrieve the results of a search for the last month.

    let dateFrom = encodeURIComponent(moment().subtract(1, "months").format("DD/MM/YYYY"));
    let dateTo = encodeURIComponent(moment().format("DD/MM/YYYY"));
    let developmentApplicationSearchUrl = DevelopmentApplicationSearchUrl.replace(/\{0\}/g, dateFrom).replace(/\{1\}/g, dateTo);
    console.log(`Retrieving search results for: ${developmentApplicationSearchUrl}`);
    let body = await request({ url: developmentApplicationSearchUrl, jar: jar });
    let $ = cheerio.load(body);

    // Parse the search results.

    for (let element of $("h4.non_table_headers").get()) {
        let address = $(element).text().trim().replace(/\s\s+/g, " ");
        let applicationNumber = "";
        let reason = "";
        let receivedDate = "";

        for (let subElement of $(element).next("div").get()) {
            for (let pairElement of $(subElement).find("p.rowDataOnly").get()) {
                let key = $(pairElement).children("span.key").text().trim();
                let value = $(pairElement).children("span.inputField").text().trim();
                if (key === "Type of Work")
                    reason = value;
                else if (key === "Application No.")
                    applicationNumber = value;
                else if (key === "Date Lodged")
                    receivedDate = value;
            }
        }

        // Ensure that at least an application number and address have been obtained.

        if (applicationNumber !== "" && address !== "") {
            let parsedReceivedDate = moment(receivedDate, "D/MM/YYYY", true);  // allows the leading zero of the day to be omitted
            await insertRow(database, {
                applicationNumber: applicationNumber,
                address: address,
                reason: reason,
                informationUrl: DevelopmentApplicationMainUrl,
                commentUrl: CommentUrl,
                scrapeDate: moment().format("YYYY-MM-DD"),
                receivedDate: parsedReceivedDate.isValid ? parsedReceivedDate.format("YYYY-MM-DD") : ""
            });
        }
    }
}

main().then(() => console.log("Complete.")).catch(error => console.error(error));
