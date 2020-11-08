import Connector from "./connector";
import fs from "fs";

export default class ConnectorLACNIC extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "lacnic";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "http://ftp.lacnic.net/lacnic/dbase/lacnic.db.gz";
        this.cacheFile = [this.cacheDir, "lacnic.db.gz"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 1;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }

    }

}

const e = new ConnectorLACNIC({});

const filterFunction = (inetnum) => {

    return true;
    if (inetnum.remarks && inetnum.remarks.length > 0 ) {
        return inetnum.remarks.some(i => i.startsWith("Geofeed"));
    }

    return false;
}

e.getObjects(["inetnum"], filterFunction, ["inetnum", "remarks"])
    .then(console.log)