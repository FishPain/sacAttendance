// Imports and requires
const express = require("express");
const exphbs = require("express-handlebars");
const bodyParser = require("body-parser");
const Airtable = require("airtable");
require("dotenv").config();
const app = express();
const package = require("./package.json");

// Express options
app.use(express.static(`public`));
app.use(bodyParser.urlencoded({ extended: true }));
// app.enable('view cache');

// Handlebars options
app.engine(
  "hbs",
  exphbs({
    defaultLayout: "main",
    extname: ".hbs",
    layoutsDir: `views/layouts/`,
  })
);
app.set("view engine", "hbs");
app.set("views", `views`);

// Airtable API Key
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

// Airtable Base ID
const baseId = process.env.AIRTABLE_BASE_ID || "app8wtFgcpJCtRHVC";

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(baseId);

// Webserver port
const port = process.env.PORT || 3000;

// Execution time: 900ms
// Retrieve all SAC Info from SAC Information
const isCardIdPresent = (cardID, callback, err) => {
  /**
   * Retrieve all SAC Info from SAC Information and store in array
   * @param {Function} callback - Validation Function
   * @param {Function} err - Error message when Card ID cannot be found.
   */
  let count = 0;
  let sacInfoObj = {};
  base("SAC Information")
    .select({
      view: "Grid view",
    })
    .eachPage(function page(records, fetchNextPage) {
      // This function (`page`) will get called for each page of records.
      records.forEach(function (record) {
        // Save record into an array
        if (record.get("Card ID") == cardID) {
          sacInfoObj["cardID"] = record.get("Card ID");
          sacInfoObj["recordID"] = record.id;
          callback();
          return;
        } else {
          count++;
        }
      });
      if (count >= records.length) {
        err();
        return;
      }
      fetchNextPage();
    });
};

function isClockedIn(cardID, clockIn, clockOut) {
  /**
   * @param {String} cardID -Card id of the card tapped on the card reader
   * @param {Function} callback -Function to check if the card id is clocked in or out
   * @param {Function} err -Error message for repeated clock in
   */

  let count = 0;

  const todayDate = new Date().toISOString().split("T")[0];
  // Retrieve from Airtable SAC Time Sheet
  base("SAC Time Sheet")
    .select({
      view: "Grid view",
      sort: [{ field: "Check In Date-Time", direction: "desc" }],
    })
    .eachPage(function page(records, fetchNextPage) {
      records.every(function (record) {
        let recordDate = record.get("Check In Date-Time")?.split("T")[0];
        // Clock Out
        if (record.get("Card ID") == cardID) {
          console.log(record.get("Check Out Date-Time") == null);
          if (
            recordDate == todayDate &&
            // new Date() - record.get("Check In Date-Time") >= 60000 &&
            record.get("Check Out Date-Time") == null
          ) {
            console.log("Clock Out");
            console.log()
            const clockOutRecordId = record.id;
            clockOut(clockOutRecordId);
            return false;
          }
          // Clock In
          else {
            console.log("Clock In 1");
            clockIn();
            return false;
          }
        } else {
          count++;
        }
      });
      if (count >= records.length) {
        console.log("Clock In 2");
        clockIn();
        return false;
      }
      fetchNextPage();
    });
}

// Express routings
app.get("/", (req, res) => {
  res.render("index", { layout: "main" });
});

app.post("/", (req, res) => {
  const card_id = req.body.cardID;
  isCardIdPresent(
    (cardID = card_id),
    // Card present in SAC Information
    () => {
      isClockedIn(
        (cardID = card_id),
        // Clock In Function
        () => {
          const checkInDateTime = new Date();
          base("SAC Time Sheet").create([
            {
              fields: {
                "Card ID": sacInfoObj.cardID,
                SAC_Card_ID: [sacInfoObj.recordID],
                "Check In Date-Time": checkInDateTime,
              },
            },
          ]);
          console.log("Clock In Successful");
          // Render Clock In Success template
          res.render('index', {
            'statusSuccessIn': true,
            'timeLogged': checkInDateTime.toLocaleTimeString('en-US',{ timeZone: 'Asia/Singapore' })
        })
          return;
        },
        // Clock Out Function
        (clockOutRecordId) => {
          const checkOutDateTime = new Date();
          base("SAC Time Sheet").update([
            {
              id: clockOutRecordId,
              fields: {
                "Check Out Date-Time": checkOutDateTime,
              },
            },
            
          ], function(err, records) {
            if (err) {
              console.error(err);
              return;
            }
        });
          // Render Clock In Success template
          res.render('index', {
            'statusSuccessOut': true,
            'timeLogged': checkOutDateTime.toLocaleTimeString('en-US',{ timeZone: 'Asia/Singapore' })
        })
          return;
        }
      );
    },
    // Error: Cannot Read Card
    () => {
      res.render("index", {
        statusFail: true,
      });
    }
  );
});

app.get('/about', (req, res) => {
    const timestampNow = new Date()
    res.render('about', {
        'version': package.version,
        'versionNumber': package.version.split('-')[0],
        'versionTime': package.version.split('-')[2],
        'versionDate': package.version.split('-')[1],
        'osName': process.platform,
        'osTime': timestampNow.toLocaleTimeString()
    })
})

//Error Codes
app.use(function (req, res, next) {
    if (res.status(400)) {
        res.render('errorCodes', {
            'errorCode': '400',
            'errorMessage': 'Its a bad request!'
        })
    }
    else if (res.status(404)) {
        res.render('errorCodes', {
            'errorCode': '404',
            'errorMessage': 'Are you on the right page?'
        })
    }
    else if (res.status(500)) {
        res.render('errorCodes', {
            'errorCode': '500',
            'errorMessage': 'Its a internal server error!'
        })
    }
    else if (res.status(502)) {
        res.render('errorCodes', {
            'errorCode': '502',
            'errorMessage': 'Its a bad gateway!'
        })
    }
    else if (res.status(503)) {
        res.render('errorCodes', {
            'errorCode': '503',
            'errorMessage': 'Service is currently unavailable.'
        })
    }
})

// Initialise webserver
app.listen(port, () => {
  console.log(`SAC attandance app listening at http://localhost:${port}`);
});
