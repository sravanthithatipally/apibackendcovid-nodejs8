const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error:${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

app.get("/users/", async (request, response) => {
  query = `
    SELECT * FROM user`;
  data = await db.all(query);
  response.send(data);
});

app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const userD = `
SELECT * FROM user WHERE username='${username}';`;
  const details = await db.get(userD);
  if (details === undefined) {
    const addUser = `
    INSERT INTO user (username,name,password,gender,location)
    VALUES('${username}',
    '${name}',
    '${hashedPassword}',
    '${gender}',
    '${location}');`;
    const data = await db.run(addUser);
    response.send("User successfully account created");
  } else {
    response.status = 400;
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  query = `
    SELECT * FROM user 
    WHERE username='${username}';`;
  data = await db.get(query);
  if (data === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, data.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY-SECRET-TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

const toValidateUser = (request, response, next) => {
  let jwtToken;
  const authHeader = request.header["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    jwt.verify(jwtToken, "MY-SECRET-TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

const outputFormatState = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const outputDistrict = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.get("/states/", toValidateUser, async (request, response) => {
  const statesData = `
    SELECT * FROM state;`;
  const statesArray = await db.all(statesData);
  response.send(statesArray.map((eachState) => outputFormatState(eachState)));
});

app.get("/states/:stateId/", toValidateUser, async (request, response) => {
  const { stateId } = request.params;
  const stateData = `
    SELECT * FROM state 
    WHERE state_id=${stateId};`;
  const state = await db.get(stateData);
  response.send(outputFormatState(state));
});

app.post("/districts/", toValidateUser, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const districtData = `
    INSERT INTO 
    district (district_name,state_id,cases,cured,active,deaths)
    VALUES
    ('${districtName}','${stateId}','${cases}','${cured}','${active}','${deaths}');`;
  const output = await db.run(districtData);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  toValidateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const districtData = `
    SELECT * FROM district 
    WHERE district_id=${districtId};`;
    const districtOutput = await db.get(districtData);
    response.send(outputDistrict(districtOutput));
  }
);

app.delete(
  "/districts/:districtId/",
  toValidateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDelete = `
    DELETE FROM district 
    WHERE district_id=${districtId};`;
    await db.run(districtDelete);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  toValidateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const districtPut = `
  UPDATE district 
  SET
  district_name='${districtName}',
  state_id='${stateId}',
  cases='${cases}',
  cured='${cured}',
  active='${active}',
  deaths='${deaths}'
  WHERE district_id=${districtId};`;
    const districtD = await db.run(districtPut);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  toValidateUser,
  async (request, response) => {
    const { stateId } = request.params;
    const stateStats = `
    SELECT 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM district
    WHERE state_id=${stateId};`;
    const stats = await db.get(stateStats);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);
app.get(
  "/districts/:districtId/details/",
  toValidateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const stateIdQuery = `
    SELECT state_id FROM district 
    WHERE district_id=${districtId};`;
    const stateIdDetails = await db.get(stateIdQuery);
    const stateName = `
    SELECT state_name as stateName FROM state
    WHERE state_id=${stateIdDetails.state_id};`;
    const stateNameDetails = await db.get(stateName);
    response.send(stateNameDetails);
  }
);
module.exports = app;
