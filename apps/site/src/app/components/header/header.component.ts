import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class HeaderComponent implements OnInit {
  isHeaderVisible = true;
  private lastScrollPosition = 0;
  private scrollThreshold = 100; // Scroll threshold in pixels

  constructor(private router: Router) { }

  ngOnInit(): void {
    this.lastScrollPosition = window.pageYOffset;
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const currentScrollPosition = window.pageYOffset;
    const scrollDifference = Math.abs(currentScrollPosition - this.lastScrollPosition);
    
    // Only change header visibility if we've scrolled past the threshold
    if (scrollDifference >= this.scrollThreshold) {
      // Scrolling down - hide header
      if (currentScrollPosition > this.lastScrollPosition) {
        this.isHeaderVisible = false;
      } 
      // Scrolling up - show header
      else {
        this.isHeaderVisible = true;
      }
      
      // Update last scroll position after making the change
      this.lastScrollPosition = currentScrollPosition;
    }
  }

  navigateToHome() {
    this.router.navigate(['/']);
  }

  navigateToAbout() {
    this.router.navigate(['/about']);
  }

  navigateToBlog() {
    this.router.navigate(['/blog']);
  }
  navigateToSecrets() {
    this.router.navigate(['/secrets']);
  }
}
