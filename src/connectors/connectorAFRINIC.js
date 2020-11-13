import Connector from "./connector";
import fs from "fs";

export default class ConnectorAFRINIC extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "afrinic";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "http://ftp.afrinic.net/dbase/afrinic.db.gz";
        this.cacheFile = [this.cacheDir, "afrinic.db.gz"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 1;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }

    }
}