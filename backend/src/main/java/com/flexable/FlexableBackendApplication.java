package com.flexable;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class FlexableBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(FlexableBackendApplication.class, args);
	}

}
