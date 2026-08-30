import { NgModule, SecurityContext } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// Make sure we have the correct import
import { MarkdownModule } from 'ngx-markdown';
import { AppComponent } from './app.component';
import { AboutComponent } from './components/about/about.component';
import { RouterModule } from '@angular/router';
import { BlogComponent } from './components/blog/blog.component';
import { AppRoutingModule } from './app.routes'; // Import the routing module
import { HeaderComponent } from './components/header/header.component'; // Import the header component
import { SecretsComponent } from './components/secrets/secrets.component';

@NgModule({
  declarations: [
    AppComponent,
    AboutComponent,
    BlogComponent,
    HeaderComponent, // Declare the header component
    SecretsComponent
  ],
  imports: [
    BrowserModule,
    CommonModule,
    AppRoutingModule, // Add this line
    RouterModule,
    FormsModule,
    // Make sure to import the module with all required features
    MarkdownModule.forRoot({
      sanitize: SecurityContext.HTML
    })
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
