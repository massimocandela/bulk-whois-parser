import Connector from "./connector";
import fs from "fs";

export default class ConnectorLACNICrir extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "lacnic-rir";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "http://ftp.lacnic.net/lacnic/dbase/lacnic.db.gz";
        this.cacheFile = [this.cacheDir, "lacnic-rir.db.gz"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 2;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }
    }
}
