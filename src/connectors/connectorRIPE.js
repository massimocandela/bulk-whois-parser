import Connector from "./connector";
import fs from "fs";

export default class ConnectorRIPE extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "ripe";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "https://ftp.ripe.net/ripe/dbase/ripe.db.gz";
        this.cacheFile = [this.cacheDir, "ripe.db.gz"].join("/").replace("//", "/");

        this.daysWhoisCache = this.params.defaultCacheDays || 2;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }
    }
}
