'use strict';

var util = require('util');

var linearscan = require('../linearscan');
var Instruction = linearscan.Instruction;

function Gap() {
  Instruction.call(this, 'gap', null);
}
util.inherits(Gap, Instruction);
module.exports = Gap;
