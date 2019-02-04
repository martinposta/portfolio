jQuery(function($) {
	
	'use strict';
	
	$(".navigation-section .mobile-menu-wrapper").append('<div class="mobile-menu"></div>');
	$(".main-menu").clone().appendTo( ".navigation-section .mobile-menu" );

	//Add toggle dropdown icon
	$( ".mobile-menu .main-menu" ).find('.menu-item-has-children').append( '<span class="zmm-dropdown-toggle fa fa-plus"></span>' );
	$( ".mobile-menu .main-menu" ).find('.sub-menu').slideToggle();
	
	$( ".mobile-menu-icon" ).on( "click", function() {
		$(".mobile-menu").slideToggle();
	});	
	
	//dropdown toggle
	$( ".zmm-dropdown-toggle" ).on( "click", function() {
		var parent = $( this ).parent('li').children('.sub-menu');
		$( this ).parent('li').children('.sub-menu').slideToggle();
		$( this ).toggleClass('fa-minus');
		if( $( parent ).find('.sub-menu').length ){
			$( parent ).find('.sub-menu').slideUp();
			$( parent ).find('.zmm-dropdown-toggle').removeClass('fa-minus');
		}
	});
	
	$('.mobile-menu-wrapper').find('.mobile-menu').append('<div class="menu-close"><i class="icon-close"></i></div>');
	$('.mobile-menu-wrapper .main-menu').before($('.menu-close'));
	
	$('.mobile-menu-wrapper .menu-close').on("click", function() { $(".mobile-menu").removeAttr("style") } );
	
	if ($(window).width() <= 1024) {
		
		//$( "body" ).addClass( "zmm-open" );
		if($('.mobile-menu-icon').on('click', function () {
			$( "body" ).addClass( "zmm-open" ); })
		);
		if($('.menu-close').on('click', function(){
			$( "body" ).removeClass( "zmm-open" ); })
		);
			
	}
	
	//sticky header
	if($('.header-menu').hasClass('sticky-activated')){
		$(window).load(function(){
      	$(".header-menu").sticky({ topSpacing: 0 });
    	});
	}
	
	//back to top
	var $scroll_obj = $( '#back-to-top' );
	$( window ).scroll(function(){
		if ( $( this ).scrollTop() > 100 ) {
		  $scroll_obj.fadeIn();
		} else {
		  $scroll_obj.fadeOut();
		}
	});
	
	$scroll_obj.click(function(){
		$( 'html, body' ).animate( { scrollTop: 0 }, 600 );
		return false;
	});
	
	$('.sticky-sidebar').theiaStickySidebar();
	
	if($("body").hasClass("rtl")) {
		var rtlcheck = true;
	}
	else{
		var rtlcheck = false;
	}

	$('#recent-slider').owlCarousel({
		loop: true,
		rtl: rtlcheck,
		margin:10,
		nav: true,
		dots: false,
		navText: ['<i class="icon-arrow-left"></i>','<i class="icon-arrow-right"></i>'],
		responsive:{
			0:{
				items:1
			},
			600:{
				items:1
			},
			1024:{
				items:1
			}
		}
	});
	
});