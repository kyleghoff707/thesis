# Thes1s Financial Data Intelligence Systems

## GAAP Taxonomy Graph Validator + Taxonomy Consensus Engine

Date: 2026-03-10

------------------------------------------------------------------------

# Overview

After completing the multi-layer validation system for Thes1s (Layers
1--5), the next step is to implement two structural intelligence
systems:

1.  GAAP Taxonomy Graph Validator
2.  Taxonomy Consensus Engine

These systems improve taxonomy accuracy and resilience by validating
financial relationships structurally and learning correct mappings from
the entire SEC dataset.

Together they allow Thes1s to evolve toward an institution-grade
financial data pipeline.

------------------------------------------------------------------------

# System Architecture

Overall financial data pipeline:

EDGAR XBRL ↓ XBRL Extraction Engine ↓ Canonical Mapping Layer ↓
Financial Statement Builder ↓ Metrics Engine ↓ Validation Layers (1--5)
↓ Graph Validator ↓ Consensus Engine ↓ Mapping Improvements

------------------------------------------------------------------------

# Part 1 --- GAAP Taxonomy Graph Validator

## Purpose

Detect incorrect taxonomy mappings using the structural relationships
defined in the official GAAP taxonomy.

Instead of validating numbers, this validator checks:

• hierarchy relationships • calculation relationships • double counting
• missing financial components • sign errors

This catches mapping mistakes before they appear as incorrect numbers.

------------------------------------------------------------------------

# Concept

The GAAP taxonomy defines financial relationships between XBRL tags.

Example:

Assets ├── CurrentAssets │ ├── Cash │ ├── AccountsReceivable │ └──
Inventory └── NonCurrentAssets

These relationships form a directed graph.

Nodes represent XBRL concepts.

Edges represent:

• calculation relationships • presentation relationships • definition
relationships

------------------------------------------------------------------------

# Data Source

Download GAAP taxonomy from:

https://xbrl.fasb.org/

Key files:

• us-gaap-\*.xsd • calculationLinkbase.xml • presentationLinkbase.xml •
definitionLinkbase.xml

------------------------------------------------------------------------

# Graph Construction

Recommended Python libraries:

networkx lxml

Node attributes:

tag label balance type statement type

Edge attributes:

parent tag child tag relationship type weight

Example schema:

taxonomy_nodes

tag label balance

taxonomy_edges

parent_tag child_tag weight relationship

------------------------------------------------------------------------

# Graph Building Process

1.  Parse taxonomy XML files
2.  Extract concept definitions
3.  Extract calculation arcs
4.  Build graph structure

Pseudo-code:

parse taxonomy XML create node for each tag for each calculation
relationship: add directed edge parent → child

------------------------------------------------------------------------

# Validation Algorithms

## 1 Calculation Integrity

Example rule:

Assets = CurrentAssets + NonCurrentAssets

Algorithm:

sum mapped children compare to parent flag mismatch

------------------------------------------------------------------------

## 2 Hierarchy Validation

Ensure mapped tags appear in expected financial statement sections.

Example:

OperatingIncome must appear under Income Statement hierarchy.

------------------------------------------------------------------------

## 3 Double Counting Detection

If two tags representing the same concept are mapped to one metric:

Revenue SalesRevenueNet

Graph validator detects overlapping nodes.

------------------------------------------------------------------------

## 4 Sign Validation

Example:

Revenue → positive Expense → negative

Validator checks expected sign orientation.

------------------------------------------------------------------------

# Graph Validator Output

taxonomy_graph_report.csv

Columns:

tag mapped_metric expected_parent observed_parent error_type

------------------------------------------------------------------------

# Integration Into Thes1s

Add module:

validation/taxonomy_graph_validator.py

Inputs:

canonical mapping table GAAP taxonomy graph

Outputs:

graph_validation_report.json

------------------------------------------------------------------------

# Part 2 --- Taxonomy Consensus Engine

## Purpose

Automatically discover correct tag-to-metric mappings using statistical
analysis across all SEC filings.

Companies frequently use different tags for the same concept.

Example revenue tags:

SalesRevenueNet RevenueFromContractWithCustomer Revenues

The consensus engine learns which tags represent the same metric.

------------------------------------------------------------------------

# Core Idea

Across all companies:

count how often each tag corresponds to each financial metric.

Compute probability:

P(metric \| tag)

Example:

SalesRevenueNet → revenue (97%) RevenueFromContractWithCustomer →
revenue (95%)

------------------------------------------------------------------------

# Data Source

SEC EDGAR APIs:

CompanyFacts API CompanyConcept API

------------------------------------------------------------------------

# Data Ingestion

Script:

consensus/build_tag_usage_db.py

For each company:

download companyfacts JSON iterate all facts store:

company tag period value

------------------------------------------------------------------------

# Database Schema

tag_usage

company tag metric count

------------------------------------------------------------------------

# Aggregation

Compute:

tag_metric_counts

tag metric occurrences

Then compute confidence:

confidence = occurrences / total tag usage

------------------------------------------------------------------------

# Consensus Mapping Table

consensus_mapping

tag suggested_metric confidence_score usage_count

Example:

SalesRevenueNet → revenue (0.97)

------------------------------------------------------------------------

# Low Confidence Detection

Tags with:

confidence \< 0.7

flag for manual review.

------------------------------------------------------------------------

# Extension Tag Handling

Companies often create custom tags.

Example:

tesla:AutomotiveRevenue

Consensus engine detects industry usage patterns and suggests mapping.

------------------------------------------------------------------------

# Implementation Modules

consensus/

build_tag_usage_db.py compute_consensus.py
generate_mapping_suggestions.py

------------------------------------------------------------------------

# Integration With Thes1s

Pipeline becomes:

EDGAR extraction ↓ Consensus mapping lookup ↓ Canonical mapping ↓
Financial statements ↓ Validation layers ↓ Graph validator

------------------------------------------------------------------------

# Development Order

Step 1 --- Implement GAAP taxonomy parser

Step 2 --- Build graph validator

Step 3 --- Create tag usage database

Step 4 --- Compute consensus mappings

Step 5 --- Integrate mapping suggestions

------------------------------------------------------------------------

# Final Result

After implementing both systems, Thes1s will have:

Layer 1 -- EDGAR validation Layer 2 -- External validation Layer 3 --
Metric validation Layer 4 -- Quarterly validation Layer 5 --
Cross-statement validation Layer 6 -- Graph taxonomy validation Layer 7
-- Consensus taxonomy learning

This results in a self-improving financial data platform capable of
maintaining high data quality as new SEC tags appear.
