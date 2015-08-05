'use strict';

var assertText = require('assert-text');
assertText.options.trim = true;

var fixtures = require('./fixtures');

function check(b, expected) {
  var out = '';

  function renderInterval(prefix, interval) {
    var out = prefix + ' ';

    if (!interval.alive)
      out += '(dead) ';

    var ranges = interval.ranges.map(function(range) {
      return range.inspect();
    }).join(', ');

    out += ranges;

    var uses = interval.uses.map(function(use) {
      return use.inspect();
    }).join(', ');

    if (uses)
      out += ' : ' + uses;

    return out;
  }

  for (var i = 0; i < b.config.registers.length; i++) {
    var reg = b.config.registers[i];
    if (reg.ranges.length === 0)
      continue;

    out += renderInterval('%' + i, reg) + '\n';
  }

  for (var i = 0; i < b.intervals.length; i++) {
    var interval = b.intervals[i];
    var prefix = interval.node.index * 3 + '. ' + interval.node.opcode;
    out += renderInterval(prefix, interval) + '\n';
  }

  assertText.equal(out, fixtures.fn2str(expected));
}

describe('Interval Builder', function() {
  it('should work on branch', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 3
          i1 = if
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
        }
        b1 -> b3

        b2 {
          i3 = literal 2
        }
        b2 -> b3

        b3 {
          i4 = ssa:phi i2, i3
          i5 = add i0, i4
          i6 = return i5
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      0. start [12;18)
      3. region [18;21)
      6. region [21;24)
      9. region [24;33)

      12. literal [14;27) : {14=*}, {27=*}
      15. if (dead) [17;18)

      18. literal [20;21) : {20=*}, {24=*}

      21. literal [23;24) : {23=*}, {24=*}

      24. ssa:phi [24;27) : {26=*}, {27=*}
      27. add [29;30) : {29=*}, {30=%0}
      30. return (dead) [32;33)
    */});
  });

  it('should work on loops', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump
        }
        b0 -> b1

        b1 {
          i2 = ssa:phi i0, i5
          i3 = if
        }
        b1 -> b2, b3

        b2 {
          i4 = literal 1
          i5 = add i2, i4
          i6 = jump
        }
        b2 -> b1

        b3 {
          i7 = return i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      0. start [12;18)
      3. region [18;24)
      6. region [24;33)
      9. region [33;36)

      12. literal [14;18) : {14=*}, {18=*}
      15. jump (dead) [17;18)

      18. ssa:phi [18;27), [33;33) : {20=*}, {27=*}, {33=%0}
      21. if (dead) [23;24)

      24. literal [26;27) : {26=*}, {27=*}
      27. add [29;33) : {18=*}, {29=*}
      30. jump (dead) [32;33)

      33. return (dead) [35;36)
    */});
  });

  it('should generate holes', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
          i3 = return i2
        }

        b2 {
         i4 = return i0
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      0. start [9;15)
      3. region [15;21)
      6. region [21;24)

      9. literal [11;15), [21;21) : {11=*}, {21=%0}
      12. jump (dead) [14;15)

      15. literal [17;18) : {17=*}, {18=%0}
      18. return (dead) [20;21)

      21. return (dead) [23;24)
    */});
  });

  it('should process spills', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal "function-name"
          i1 = literal 0
          i2 = call i0, i1
          i3 = return i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [10;11)
      %1 [10;11)
      %2 [10;11)
      0. start [3;15)
      3. literal [5;9) : {5=*}, {9=%*}
      6. literal [8;9) : {8=*}, {9=*}
      9. call [11;12) : {11=%0}, {12=%0}
      12. return (dead) [14;15)
    */});
  });
});
