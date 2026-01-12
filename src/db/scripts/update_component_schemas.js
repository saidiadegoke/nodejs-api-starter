/**
 * Update Component Schemas Script
 * 
 * Updates existing component records in component_registry with corrected schema configurations.
 * This script should be run after updating the migration file but before the migration was re-run.
 */

const pool = require('../../db/pool');

// Updated component configs with corrected schemas
const componentConfigs = {
  breadcrumbs: {
    defaultContent: {
      items: [],
      separator: "/",
      showHome: true,
      homeUrl: "/",
      homeLabel: "Home"
    },
    defaultSettings: {
      maxItems: null,
      collapse: false,
      showCurrentAsLink: false
    },
    schema: {
      data: {
        items: { type: "array", description: "Breadcrumb items array with label, url, and optional icon" },
        separator: { type: "string", options: ["/", ">", "|", "•"], default: "/", description: "Separator between breadcrumb items" },
        showHome: { type: "boolean", default: true, description: "Show home link" },
        homeUrl: { type: "string", default: "/", description: "Home URL" },
        homeLabel: { type: "string", default: "Home", description: "Home link label" }
      },
      settings: {
        maxItems: { type: "number", description: "Maximum items to display before collapsing" },
        collapse: { type: "boolean", default: false, description: "Collapse middle items when maxItems is exceeded" },
        showCurrentAsLink: { type: "boolean", default: false, description: "Show current page as a clickable link" }
      }
    }
  },
  cta: {
    defaultContent: {
      headline: "",
      description: "",
      buttonLabel: "Get Started",
      buttonUrl: "#",
      buttonVariant: "primary",
      buttonTarget: "_self",
      secondaryButton: null,
      background: "",
      backgroundImage: ""
    },
    defaultSettings: {
      centered: true,
      compact: false,
      backgroundOverlay: false,
      backgroundOverlayOpacity: 0.4,
      maxWidth: "800px"
    },
    schema: {
      data: {
        headline: { type: "string", description: "Headline text" },
        description: { type: "string", description: "Description text" },
        buttonLabel: { type: "string", default: "Get Started", description: "Primary button label" },
        buttonUrl: { type: "string", default: "#", description: "Primary button URL" },
        buttonVariant: { type: "string", options: ["primary", "secondary", "outline"], default: "primary", description: "Primary button style variant" },
        buttonTarget: { type: "string", options: ["_self", "_blank"], default: "_self", description: "Primary button link target" },
        secondaryButton: { type: "object", description: "Secondary button configuration with label, url, variant, and target" },
        background: { type: "string", description: "Background color (hex, rgb, or CSS color name)" },
        backgroundImage: { type: "string", description: "Background image URL" }
      },
      settings: {
        centered: { type: "boolean", default: true, description: "Center align content" },
        compact: { type: "boolean", default: false, description: "Use compact spacing" },
        backgroundOverlay: { type: "boolean", default: false, description: "Add overlay when using background image" },
        backgroundOverlayOpacity: { type: "number", default: 0.4, description: "Overlay opacity (0-1)" },
        maxWidth: { type: "string", default: "800px", description: "Maximum content width" }
      }
    }
  },
  features: {
    defaultContent: {
      title: "",
      subtitle: "",
      items: [],
      template: "grid",
      columns: 3,
      spacing: "2rem"
    },
    defaultSettings: {
      iconStyle: "rounded",
      iconSize: "md",
      cardStyle: false,
      alignment: "left"
    },
    schema: {
      data: {
        title: { type: "string", description: "Section title" },
        subtitle: { type: "string", description: "Section subtitle" },
        items: { type: "array", required: true, description: "Feature items" },
        template: { type: "string", options: ["grid", "list", "cards", "icons-top", "icons-left"], default: "grid" },
        columns: { type: "number", default: 3 },
        spacing: { type: "string", default: "2rem" }
      },
      settings: {
        iconStyle: { type: "string", options: ["filled", "outlined", "rounded", "square"], default: "rounded", description: "Icon style" },
        iconSize: { type: "string", options: ["sm", "md", "lg"], default: "md", description: "Icon size" },
        cardStyle: { type: "boolean", default: false, description: "Use card styling" },
        alignment: { type: "string", options: ["left", "center", "right"], default: "left", description: "Text alignment" }
      }
    }
  },
  testimonials: {
    defaultContent: {
      title: "",
      subtitle: "",
      items: [],
      template: "grid",
      columns: 3,
      spacing: "2rem"
    },
    defaultSettings: {
      autoplay: false,
      autoplayInterval: 5000,
      showNavigation: true,
      showPagination: true,
      cardStyle: true,
      showStars: true
    },
    schema: {
      data: {
        title: { type: "string", description: "Section title" },
        subtitle: { type: "string", description: "Section subtitle" },
        items: { type: "array", required: true, description: "Testimonial items array with quote, author, role, avatar, and rating" },
        template: { type: "string", options: ["slider", "grid", "cards", "quote-style"], default: "grid", description: "Display template" },
        columns: { type: "number", default: 3, description: "Number of columns for grid layout" },
        spacing: { type: "string", default: "2rem", description: "Spacing between items" }
      },
      settings: {
        autoplay: { type: "boolean", default: false, description: "Auto-play slider" },
        autoplayInterval: { type: "number", default: 5000, description: "Autoplay interval in milliseconds" },
        showNavigation: { type: "boolean", default: true, description: "Show navigation arrows" },
        showPagination: { type: "boolean", default: true, description: "Show pagination dots" },
        cardStyle: { type: "boolean", default: true, description: "Use card styling" },
        showStars: { type: "boolean", default: true, description: "Show star ratings" }
      }
    }
  },
  contactform: {
    defaultContent: {
      fields: {
        name: true,
        email: true,
        message: true,
        phone: false,
        subject: false
      },
      template: "default",
      layout: "vertical",
      title: "",
      description: "",
      submitLabel: "Send Message",
      emailTo: "",
      subjectPrefix: "Contact Form:"
    },
    defaultSettings: {
      successMessage: "Thank you! Your message has been sent.",
      errorMessage: "There was an error sending your message. Please try again.",
      redirectUrl: "",
      fieldOrder: ["name", "email", "phone", "subject", "message"],
      showLabels: true,
      requiredFields: ["name", "email", "message"]
    },
    schema: {
      data: {
        fields: { type: "object", description: "Field visibility config" },
        template: { type: "string", options: ["default", "compact", "inline"], default: "default" },
        layout: { type: "string", options: ["vertical", "horizontal"], default: "vertical" },
        title: { type: "string", description: "Form title" },
        description: { type: "string", description: "Form description" },
        submitLabel: { type: "string", default: "Send Message" },
        emailTo: { type: "string", description: "Recipient email address" }
      },
      settings: {
        successMessage: { type: "string", default: "Thank you! Your message has been sent.", description: "Success message after form submission" },
        errorMessage: { type: "string", default: "There was an error sending your message. Please try again.", description: "Error message on form submission failure" },
        redirectUrl: { type: "string", description: "Redirect URL after successful submission" },
        fieldOrder: { type: "array", default: ["name", "email", "phone", "subject", "message"], description: "Order of form fields" },
        showLabels: { type: "boolean", default: true, description: "Show field labels" },
        requiredFields: { type: "array", default: ["name", "email", "message"], description: "Required form fields" }
      }
    }
  },
  newsletter: {
    defaultContent: {
      title: "Subscribe to our newsletter",
      description: "",
      placeholder: "Enter your email",
      buttonLabel: "Subscribe",
      template: "inline",
      service: "custom"
    },
    defaultSettings: {
      apiKey: "",
      listId: "",
      inputStyle: "default",
      buttonStyle: "primary",
      actionUrl: "",
      successMessage: "Thank you for subscribing!",
      errorMessage: "Failed to subscribe. Please try again."
    },
    schema: {
      data: {
        title: { type: "string", default: "Subscribe to our newsletter" },
        description: { type: "string", description: "Description text" },
        placeholder: { type: "string", default: "Enter your email" },
        buttonLabel: { type: "string", default: "Subscribe" },
        template: { type: "string", options: ["inline", "centered", "compact", "split"], default: "inline" },
        service: { type: "string", options: ["mailchimp", "convertkit", "custom"], default: "custom" }
      },
      settings: {
        apiKey: { type: "string", description: "API key for newsletter service" },
        listId: { type: "string", description: "List ID for newsletter service" },
        inputStyle: { type: "string", options: ["default", "outlined", "filled"], default: "default", description: "Input field style" },
        buttonStyle: { type: "string", options: ["primary", "secondary", "outline"], default: "primary", description: "Button style variant" },
        actionUrl: { type: "string", description: "Custom form submission URL" },
        successMessage: { type: "string", default: "Thank you for subscribing!", description: "Success message" },
        errorMessage: { type: "string", default: "Failed to subscribe. Please try again.", description: "Error message" }
      }
    }
  },
  gallery: {
    defaultContent: {
      title: "",
      images: [],
      template: "grid",
      columns: 3,
      spacing: "1rem"
    },
    defaultSettings: {
      lightbox: true,
      lazyLoad: true,
      aspectRatio: "16:9",
      imageSize: "medium",
      showCaptions: true,
      autoplay: false,
      showNavigation: true,
      showPagination: true
    },
    schema: {
      data: {
        title: { type: "string", description: "Gallery title" },
        images: { type: "array", required: true, description: "Gallery images" },
        template: { type: "string", options: ["grid", "masonry", "carousel", "lightbox"], default: "grid" },
        columns: { type: "number", default: 3 },
        spacing: { type: "string", default: "1rem" }
      },
      settings: {
        lightbox: { type: "boolean", default: true, description: "Enable lightbox for images" },
        lazyLoad: { type: "boolean", default: true, description: "Lazy load images" },
        aspectRatio: { type: "string", default: "16:9", description: "Image aspect ratio" },
        imageSize: { type: "string", options: ["thumb", "small", "medium", "large", "full"], default: "medium", description: "Image display size" },
        showCaptions: { type: "boolean", default: true, description: "Show image captions" },
        autoplay: { type: "boolean", default: false, description: "Auto-play carousel" },
        showNavigation: { type: "boolean", default: true, description: "Show carousel navigation" },
        showPagination: { type: "boolean", default: true, description: "Show carousel pagination" }
      }
    }
  }
};

async function updateComponentSchemas() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting component schema updates...\n');
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const [componentType, newConfig] of Object.entries(componentConfigs)) {
      try {
        // Check if component exists
        const checkResult = await client.query(
          'SELECT id, name, component_type FROM component_registry WHERE component_type = $1 AND is_system = true',
          [componentType]
        );
        
        if (checkResult.rows.length === 0) {
          console.log(`⏭️  Skipping ${componentType} - component not found in database`);
          skippedCount++;
          continue;
        }
        
        const component = checkResult.rows[0];
        console.log(`📝 Updating ${component.name} (${component.component_type})...`);
        
        // Update the config
        await client.query(
          'UPDATE component_registry SET config = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [JSON.stringify(newConfig), component.id]
        );
        
        console.log(`   ✅ Updated successfully`);
        updatedCount++;
      } catch (error) {
        console.error(`   ❌ Error updating ${componentType}:`, error.message);
      }
    }
    
    console.log(`\n✨ Schema update complete!`);
    console.log(`   ✅ Updated: ${updatedCount} components`);
    console.log(`   ⏭️  Skipped: ${skippedCount} components`);
    
  } catch (error) {
    console.error('❌ Error updating component schemas:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the script
if (require.main === module) {
  updateComponentSchemas()
    .then(() => {
      console.log('\n🎉 All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { updateComponentSchemas };

