import Connector from "./connector";
import fs from "fs";
import ipUtils from "ip-sub";

export default class ConnectorLACNICrir extends Connector {
    constructor(params) {
        super(params);

        this.connectorName = "lacnic-rir";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "http://ftp.lacnic.net/lacnic/dbase/lacnic.db.gz";
        this.cacheFile = [this.cacheDir, "lacnic-rir.db.gz"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 2;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, {recursive: true});
        }
    }

    _lacnicPrefixCompatibility = (prefix) => {
        const [ip, bits] = ipUtils.getIpAndCidr(prefix);
        const af = ipUtils.getAddressFamily(prefix);

        return [ipUtils._expandIP(ip, af), bits].join("/");
    };

    getStandardFormat = ([key, value]) => {
        if (key && value && !key.startsWith("#") && !key.startsWith("%")) {

            if (["inetnum", "inet6num"].includes(key)) {
                value = this._lacnicPrefixCompatibility(value);
            }

            return [key, value];
        }

        return [null, null];
    };

}
