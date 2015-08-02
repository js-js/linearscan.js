'use strict';

var assert = require('assert');

var fixtures = require('../fixtures');

describe('Interval Builder', function() {
  it('should populate liveGen/liveKill', function() {
    var b = fixtures.createBuilder(function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = add i0, i1
        }
        b0 -> b1

        b1 {
          i3 = return i2
        }
      }
    */});

    b.buildLocal();

    var one = b.input.blocks[0].nodes[0].index;
    var two = b.input.blocks[0].nodes[1].index;
    var add = b.input.blocks[0].nodes[2].index;
    var ret = b.input.blocks[1].nodes[0].index;

    assert(b.liveKill[0].check(one));
    assert(b.liveKill[0].check(two));
    assert(b.liveKill[0].check(add));

    // literals are local to the block, should not be propagated
    assert(!b.liveGen[0].check(one));
    assert(!b.liveGen[0].check(two));
    assert(!b.liveGen[0].check(add));

    assert(b.liveKill[1].check(ret));
    assert(!b.liveGen[1].check(one));
    assert(!b.liveGen[1].check(two));
    assert(b.liveGen[1].check(add));
  });
});
