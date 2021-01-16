import fs from "fs";
import Connector from "./connector";

export default class ConnectorLACNICrr extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "lacnic-rr";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "http://ftp.lacnic.net/lacnic/irr/lacnic.db.gz";
        this.cacheFile = [this.cacheDir, "lacnic.db.gz"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 2;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }
    }
}
