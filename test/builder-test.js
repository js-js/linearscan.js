'use strict';

var fixtures = require('./fixtures');
var check = fixtures.checkBuilder;

describe('Interval Builder', function() {
  it('should work on branch', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 3
          i1 = if ^b0
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
          i3 = jump ^b1
        }
        b1 -> b3

        b2 {
          i4 = literal 2
          i5 = jump ^b2
        }
        b2 -> b3

        b3 {
          i6 = ssa:phi ^b3, i2, i4
          i7 = add i0, i6
          i8 = return ^b3, i7
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [22;23)

      0. start (dead) [0;6)
      6. region (dead) [6;12)
      12. region (dead) [12;18)
      18. region (dead) [18;26)

      1. literal [1;21) : {1=*}, {21=*}
      3. if (dead) [3;4)

      7. literal [7;12) : {7=*}, {19=*}
      9. jump (dead) [9;10)

      13. literal [13;18) : {13=*}, {19=*}
      15. jump (dead) [15;16)

      18. ssa:phi [18;21) : {19=*}, {21=*}
      21. add [21;22) : {21=*}, {23=%0}
      23. return (dead) [23;24)
    */});
  });

  it('should work on loops', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump ^b0
        }
        b0 -> b1

        b1 {
          i2 = ssa:phi ^b1, i0, i5
          i3 = if ^b1
        }
        b1 -> b2, b3

        b2 {
          i4 = literal 1
          i5 = add i2, i4
          i6 = jump ^b2
        }
        b2 -> b1

        b3 {
          i7 = return ^b3, i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [20;21)

      0. start (dead) [0;6)
      6. region (dead) [6;12)
      12. region (dead) [12;20)
      20. region (dead) [20;24)

      1. literal [1;6) : {1=*}, {7=*}, {20=*}
      3. jump (dead) [3;4)

      6. ssa:phi [6;15) : {7=*}, {15=*}, {21=%0}
      9. if (dead) [9;10)

      13. literal [13;15) : {13=*}, {15=*}
      15. add [15;20) : {7=*}, {15=*}, {20=*}
      17. jump (dead) [17;18)

      21. return (dead) [21;22)
    */});
  });

  it('should generate holes', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump ^b0
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
          i3 = return ^b1, i2
        }

        b2 {
          i4 = add i0, i0
          i5 = return ^b2, i0
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [8;9), [14;15)

      0. start (dead) [0;6)
      6. region (dead) [6;12)
      12. region (dead) [12;18)

      1. literal [1;6), [12;14) : {1=*}, {13=*}, {13=*}, {15=%0}
      3. jump (dead) [3;4)

      7. literal [7;8) : {7=*}, {9=%0}
      9. return (dead) [9;10)

      13. add [13;14) : {13=*}
      15. return (dead) [15;16)
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
      %0 [5;7)
      %1 [5;6)
      %2 [5;6)
      %3 [5;6)

      0. start (dead) [0;10)

      1. literal [1;5) : {1=*}, {5=%*}
      3. literal [3;5) : {3=*}, {5=*}
      5. call %0 (dead) [5;6) : {5=%0}, {7=%0}
      7. return (dead) [7;8)
    */});
  });

  it('should produce correct single block intervals', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = add i0, i0
          i2 = return i0
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [4;5)

      0. start (dead) [0;8)

      1. literal [1;4) : {1=*}, {3=*}, {3=*}, {5=%0}
      3. add [3;4) : {3=*}
      5. return (dead) [5;6)
    */});
  });

  it('should split on fixed output', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal "function-name"
          i1 = literal 0
          i2 = call i0, i1
          i3 = add i2, i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [5;6)
      %1 [5;6)
      %2 [5;6)
      %3 [5;6)

      0. start (dead) [0;10)

      1. literal [1;5) : {1=*}, {5=%*}
      3. literal [3;5) : {3=*}, {5=*}
      5. call %0 (dead) [5;6) : {5=%0}
      7. add [7;8) : {7=*}
    */});
  });
});
