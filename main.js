var main = new Vue({
    el: '#main',
    data: {
        robotImage: './images/header_yellow.png',
        backgroundColor: 'bkgd-color-blue',
        textColor: 'text-yellow',
        navColor: 'nav-yellow',
        pActive: [true, false, false],
    },

    methods: {
      paletteOne: function () {
            this.robotImage = './images/header_yellow.png';
            this.backgroundColor = 'bkgd-color-blue';
            this.navColor = 'nav-yellow';
            this.textColor = 'text-yellow';
            this.togglePaletteActive(0);
        },

        paletteTwo: function () {
          this.robotImage = './images/header_grey.png';
          this.backgroundColor = 'bkgd-color-grey';
          this.navColor = 'nav-light';
          this.textColor = 'text-light';
          this.togglePaletteActive(1);
        },

        paletteThree: function () {
          this.robotImage = './images/header_glitch.png';
          this.backgroundColor = 'bkgd-color-glitch';
          this.navColor = 'nav-denim';
          this.textColor = 'text-green';
          this.togglePaletteActive(2);
        },

        togglePaletteActive: function (activeIndex) {
          for (var i = 0; i < this.pActive.length; i++) {
            if (i === activeIndex) {
              this.pActive[i] = true;
            }
            else {
              this.pActive[i] = false;
            }
          }
        }
    },
});
