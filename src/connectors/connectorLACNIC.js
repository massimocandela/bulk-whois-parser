import Connector from "./connector";
import ConnectorAPNICrir from "./ConnectorLACNICrir";
import ConnectorAPNICrr from "./ConnectorLACNICrr";
import batchPromises from "batch-promises";

export default class ConnectorLACNIC extends Connector {
    constructor(params) {
        super(params)

        this.rir = new ConnectorAPNICrir(params);
        this.rr = new ConnectorAPNICrr(params);
    }


    _getCorrectConnector = (type, filterFunction, fields) => {
        if (["route", "route6", "as-set", "aut-num", "mntner", "person"].includes(type)) {
            return this.rr.getObjects([type], filterFunction, fields);
        } else {
            return this.rir.getObjects([type], filterFunction, fields);
        }
    };


    getObjects = (types, filterFunction, fields) => {
        fields = fields || [];

        return batchPromises(1, types, type => {
            return this._getCorrectConnector(type, filterFunction, fields)
        })
            .then(objects => [].concat.apply([], objects));
    }

}
