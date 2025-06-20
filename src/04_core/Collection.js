/**
 * Collection.js - MongoDB-Compatible Collection Implementation
 *
 * Provides MongoDB-compatible API for collection operations with QueryEngine support:
 * - Full CRUD operations with field-based query support
 * - Lazy loading from Google Drive
 * - Integration with CollectionMetadata, DocumentOperations, and QueryEngine
 * - File persistence through FileService
 *
 * Enhanced in Section 6 with QueryEngine integration:
 * - findOne(filter): supports {}, {_id: "id"}, and field-based queries
 * - find(filter): supports {} and field-based queries
 * - updateOne(filter, update): supports field-based filters, document replacement only
 * - deleteOne(filter): supports field-based filters
 * - countDocuments(filter): supports {} and field-based queries
 *
 * Note: Update operators ($set, $push, etc.) require Section 7 Update Engine
 */

/**
 * Collection - MongoDB-compatible collection with QueryEngine support
 *
 * Coordinates CollectionMetadata, DocumentOperations, and QueryEngine to provide:
 * - MongoDB-standard method signatures
 * - Lazy loading and memory management
 * - File persistence and dirty tracking
 * - Field-based query support through QueryEngine
 */
class Collection {
  /**
   * Creates a new Collection instance
   * @param {string} name - Collection name
   * @param {string} driveFileId - Google Drive file ID for persistence
   * @param {Database} database - Database instance reference
   * @param {FileService} fileService - FileService for Drive operations
   * @throws {InvalidArgumentError} For invalid parameters
   */
  constructor(name, driveFileId, database, fileService) {
    // Use Validate for parameter validation
    Validate.nonEmptyString(name, "name");
    Validate.nonEmptyString(driveFileId, "driveFileId");
    Validate.object(database, "database");
    Validate.object(fileService, "fileService");
    Validate.func(fileService.readFile, "fileService.readFile");
    Validate.func(fileService.writeFile, "fileService.writeFile");

    this._name = name;
    this._driveFileId = driveFileId;
    this._database = database;
    this._fileService = fileService;
    this._logger = GASDBLogger.createComponentLogger("Collection");

    // Internal state management
    this._loaded = false;
    this._dirty = false;
    this._documents = {};
    this._metadata = null;
    this._collectionMetadata = null;
    this._documentOperations = null;
  }

  /**
   * Ensures collection data is loaded from Drive (lazy loading)
   * @private
   * @throws {OperationError} If loading fails
   */
  _ensureLoaded() {
    if (!this._loaded) {
      this._loadData();
      this._loaded = true;
    }
  }

  /**
   * Loads collection data from Drive file
   * @private
   * @throws {OperationError} If file read fails
   */
  _loadData() {
    try {
      this._logger.debug("Loading collection data from Drive", {
        fileId: this._driveFileId,
      });

      // FileService.readFile() already returns parsed JSON object, not a string
      const data = this._fileService.readFile(this._driveFileId);

      // Validate file structure
      if (!data || typeof data !== "object") {
        throw new OperationError(
          "Invalid file structure",
          "Collection file must contain a JSON object"
        );
      }

      // Initialise documents and metadata with defaults
      this._documents = data.documents || {};
      const metadataObj = data.metadata || {};

      // Create CollectionMetadata instance with name and fileId
      this._collectionMetadata = new CollectionMetadata(
        this._name,
        this._driveFileId,
        metadataObj
      );

      // Create DocumentOperations instance with this collection as reference
      this._documentOperations = new DocumentOperations(this);

      this._logger.debug("Collection data loaded successfully", {
        documentCount: Object.keys(this._documents).length,
        metadata: this._collectionMetadata.toJSON(),
      });
    } catch (error) {
      this._logger.error("Failed to load collection data", {
        fileId: this._driveFileId,
        error: error.message,
      });

      if (error instanceof OperationError) {
        throw error;
      }

      throw new OperationError("Collection data loading failed", error.message);
    }
  }

  /**
   * Saves collection data to Drive file
   * @private
   * @throws {OperationError} If file write fails
   */
  _saveData() {
    try {
      this._logger.debug("Saving collection data to Drive", {
        fileId: this._driveFileId,
      });

      const data = {
        documents: this._documents,
        metadata: this._collectionMetadata.toJSON(),
      };

      this._fileService.writeFile(this._driveFileId, data);

      this._dirty = false;
      this._logger.debug("Collection data saved successfully");
    } catch (error) {
      this._logger.error("Failed to save collection data", {
        fileId: this._driveFileId,
        error: error.message,
      });

      throw new OperationError("Collection data saving failed", error.message);
    }
  }

  /**
   * Marks collection as dirty for persistence
   * @private
   */
  _markDirty() {
    this._dirty = true;
    this._logger.debug("Collection marked as dirty");
  }

  /**
   * Updates collection metadata
   * @private
   * @param {Object} changes - Metadata changes to apply
   */
  _updateMetadata(changes = {}) {
    this._ensureLoaded();

    if (changes.documentCount !== undefined) {
      this._collectionMetadata.setDocumentCount(changes.documentCount);
    }

    this._collectionMetadata.updateLastModified();
    this._logger.debug("Collection metadata updated", { changes });

    // Propagate metadata change to MasterIndex
    if (this._database && this._database._masterIndex) {
      // Push full metadata object for atomic replace
      this._database._masterIndex.updateCollectionMetadata(
        this._name,
        this._collectionMetadata.toJSON()
      );
    }
  }

  /**
   * Validates filter object structure
   * @private
   * @param {Object} filter - Filter to validate
   * @param {string} operation - Operation name for error messages
   * @throws {InvalidArgumentError} For invalid filter structure
   */
  _validateFilter(filter, operation) {
    // Use Validate for filter validation
    Validate.object(filter, "filter");

    const filterKeys = Object.keys(filter);

    // Validate _id filter value if present
    if (filterKeys.includes("_id")) {
      Validate.nonEmptyString(filter._id, "filter._id");
    }
  }

  /**
   * Insert a single document (MongoDB-compatible)
   * @param {Object} doc - Document to insert
   * @returns {Object} {insertedId: string, acknowledged: boolean}
   * @throws {InvalidArgumentError} For invalid documents
   * @throws {ConflictError} For duplicate IDs
   */
  insertOne(doc) {
    this._ensureLoaded();

    const insertedDoc = this._documentOperations.insertDocument(doc);

    // Update metadata and mark dirty
    this._updateMetadata({
      documentCount: Object.keys(this._documents).length,
    });
    this._markDirty();

    return {
      insertedId: insertedDoc._id,
      acknowledged: true,
    };
  }

  /**
   * Find a single document by filter (MongoDB-compatible with QueryEngine support)
   * @param {Object} filter - Query filter (supports field-based queries, _id queries, and empty filter)
   * @returns {Object|null} Document object or null
   * @throws {InvalidArgumentError} For invalid filters
   */
  findOne(filter = {}) {
    this._ensureLoaded();
    this._validateFilter(filter, "findOne");

    const filterKeys = Object.keys(filter);

    // Empty filter {} - return first document
    if (filterKeys.length === 0) {
      const allDocs = this._documentOperations.findAllDocuments();
      return allDocs.length > 0 ? allDocs[0] : null;
    }

    // ID filter {_id: "id"} - use direct lookup for performance
    if (filterKeys.length === 1 && filterKeys[0] === "_id") {
      return this._documentOperations.findDocumentById(filter._id);
    }

    // Field-based or complex queries - use QueryEngine
    return this._documentOperations.findByQuery(filter);
  }

  /**
   * Find multiple documents by filter (MongoDB-compatible with QueryEngine support)
   * @param {Object} filter - Query filter (supports field-based queries and empty filter)
   * @returns {Array} Array of document objects
   * @throws {InvalidArgumentError} For invalid filters
   */
  find(filter = {}) {
    this._ensureLoaded();
    this._validateFilter(filter, "find");

    const filterKeys = Object.keys(filter);

    // Empty filter {} - return all documents
    if (filterKeys.length === 0) {
      return this._documentOperations.findAllDocuments();
    }

    // Field-based or complex queries - use QueryEngine
    return this._documentOperations.findMultipleByQuery(filter);
  }

  /**
   * Update a single document by filter (MongoDB-compatible with QueryEngine support)
   * @param {string|Object} filterOrId - Document ID or filter criteria
   * @param {Object} update - Update operators (e.g. {$set: {field: value}}) or document replacement
   * @returns {Object} {matchedCount: number, modifiedCount: number, acknowledged: boolean}
   * @throws {InvalidArgumentError} For invalid parameters
   */
  updateOne(filterOrId, update) {
    this._ensureLoaded();

    // Use Validate for update validation - disallow empty objects
    Validate.object(update, "update", false);

    // Determine if this is a filter or ID
    const isIdFilter = typeof filterOrId === "string";
    const filter = isIdFilter ? { _id: filterOrId } : filterOrId;

    if (!isIdFilter) {
      this._validateFilter(filter, "updateOne");
    }

    // Validate update object structure - forbid mixing operators and document fields
    Validate.validateUpdateObject(update, "update");

    // Determine operation type and delegate to appropriate helper
    const updateKeys = Object.keys(update);
    const hasOperators = updateKeys.some((key) => key.startsWith("$"));

    if (hasOperators) {
      return this._updateOneWithOperators(filter, update);
    } else {
      return this._updateOneWithReplacement(filter, update);
    }
  }

  /**
   * Updates a single document using update operators
   * @private
   * @param {Object} filter - Query filter
   * @param {Object} update - Update operators
   * @returns {Object} Update result
   */
  _updateOneWithOperators(filter, update) {
    const filterKeys = Object.keys(filter);

    if (filterKeys.length === 1 && filterKeys[0] === "_id") {
      // ID-based update with operators
      const result = this._documentOperations.updateDocumentWithOperators(
        filter._id,
        update
      );

      if (result.modifiedCount > 0) {
        this._updateMetadata();
        this._markDirty();
      }

      return {
        matchedCount: result.modifiedCount > 0 ? 1 : 0,
        modifiedCount: result.modifiedCount,
        acknowledged: true,
      };
    } else {
      // Field-based filter update with operators
      const matchingDoc = this._documentOperations.findByQuery(filter);

      if (!matchingDoc) {
        return {
          matchedCount: 0,
          modifiedCount: 0,
          acknowledged: true,
        };
      }

      const result = this._documentOperations.updateDocumentWithOperators(
        matchingDoc._id,
        update
      );

      if (result.modifiedCount > 0) {
        this._updateMetadata();
        this._markDirty();
      }

      return {
        matchedCount: 1,
        modifiedCount: result.modifiedCount,
        acknowledged: true,
      };
    }
  }

  /**
   * Updates a single document with replacement
   * @private
   * @param {Object} filter - Query filter
   * @param {Object} update - Replacement document
   * @returns {Object} Update result
   */
  _updateOneWithReplacement(filter, update) {
    const filterKeys = Object.keys(filter);

    if (filterKeys.length === 1 && filterKeys[0] === "_id") {
      // ID-based document replacement
      const result = this._documentOperations.updateDocument(
        filter._id,
        update
      );

      if (result.modifiedCount > 0) {
        this._updateMetadata();
        this._markDirty();
      }

      return {
        matchedCount: result.modifiedCount > 0 ? 1 : 0,
        modifiedCount: result.modifiedCount,
        acknowledged: true,
      };
    } else {
      // Field-based filter document replacement
      const matchingDoc = this._documentOperations.findByQuery(filter);

      if (!matchingDoc) {
        return {
          matchedCount: 0,
          modifiedCount: 0,
          acknowledged: true,
        };
      }

      const result = this._documentOperations.updateDocument(
        matchingDoc._id,
        update
      );

      if (result.modifiedCount > 0) {
        this._updateMetadata();
        this._markDirty();
      }

      return {
        matchedCount: 1,
        modifiedCount: result.modifiedCount,
        acknowledged: true,
      };
    }
  }

  /**
   * Update multiple documents matching a filter (MongoDB-compatible)
   * @param {Object} filter - Query filter criteria
   * @param {Object} update - Update operators (e.g. {$set: {field: value}})
   * @returns {Object} {matchedCount: number, modifiedCount: number, acknowledged: boolean}
   * @throws {InvalidArgumentError} For invalid parameters
   */
  updateMany(filter, update) {
    this._ensureLoaded();
    this._validateFilter(filter, "updateMany");

    // Use Validate for update validation - disallow empty objects
    Validate.object(update, "update", false);

    // Validate update object structure - require operators only
    Validate.validateUpdateObject(update, "update", { requireOperators: true });

    // Determine operator presence
    const updateKeys = Object.keys(update);
    const hasOperators = updateKeys.some((key) => key.startsWith("$"));

    // Find all matching documents first
    const matchingDocs = this._documentOperations.findMultipleByQuery(filter);
    const matchedCount = matchingDocs.length;

    if (matchedCount === 0) {
      return {
        matchedCount: 0,
        modifiedCount: 0,
        acknowledged: true,
      };
    }

    // Apply updates to all matching documents
    let modifiedCount = 0;
    for (const doc of matchingDocs) {
      const result = this._documentOperations.updateDocumentWithOperators(
        doc._id,
        update
      );
      modifiedCount += result.modifiedCount;
    }

    if (modifiedCount > 0) {
      this._updateMetadata();
      this._markDirty();
    }

    return {
      matchedCount: matchedCount,
      modifiedCount: modifiedCount,
      acknowledged: true,
    };
  }

  /**
   * Replace a single document by filter or ID (MongoDB-compatible)
   * @param {string|Object} filterOrId - Document ID or filter criteria
   * @param {Object} doc - Replacement document (cannot contain update operators)
   * @returns {Object} {matchedCount: number, modifiedCount: number, acknowledged: boolean}
   * @throws {InvalidArgumentError} For invalid parameters
   */
  replaceOne(filterOrId, doc) {
    this._ensureLoaded();

    // Use Validate for doc validation - disallow empty objects
    Validate.object(doc, "doc", false);

    // Validate that replacement document contains no operators
    Validate.validateUpdateObject(doc, "doc", { forbidOperators: true });

    // Determine if this is a filter or ID
    const isIdFilter = typeof filterOrId === "string";
    const filter = isIdFilter ? { _id: filterOrId } : filterOrId;

    if (!isIdFilter) {
      this._validateFilter(filter, "replaceOne");
    }

    const filterKeys = Object.keys(filter);

    if (filterKeys.length === 1 && filterKeys[0] === "_id") {
      // ID-based replacement
      const result = this._documentOperations.replaceDocument(filter._id, doc);

      if (result.modifiedCount > 0) {
        this._updateMetadata();
        this._markDirty();
      }

      return {
        matchedCount: result.modifiedCount > 0 ? 1 : 0,
        modifiedCount: result.modifiedCount,
        acknowledged: true,
      };
    } else {
      // Field-based filter replacement
      const matchingDoc = this._documentOperations.findByQuery(filter);

      if (!matchingDoc) {
        return {
          matchedCount: 0,
          modifiedCount: 0,
          acknowledged: true,
        };
      }

      const result = this._documentOperations.replaceDocument(
        matchingDoc._id,
        doc
      );

      if (result.modifiedCount > 0) {
        this._updateMetadata();
        this._markDirty();
      }

      return {
        matchedCount: 1,
        modifiedCount: result.modifiedCount,
        acknowledged: true,
      };
    }
  }

  /**
   * Delete a single document by filter (MongoDB-compatible with QueryEngine support)
   * @param {Object} filter - Query filter (supports field-based queries, _id queries, and empty filter)
   * @returns {Object} {deletedCount: number, acknowledged: boolean}
   * @throws {InvalidArgumentError} For invalid filters
   */
  deleteOne(filter = {}) {
    this._ensureLoaded();
    this._validateFilter(filter, "deleteOne");

    const filterKeys = Object.keys(filter);

    // Empty filter {} - delete first document found
    if (filterKeys.length === 0) {
      const allDocs = this._documentOperations.findAllDocuments();
      if (allDocs.length === 0) {
        return {
          deletedCount: 0,
          acknowledged: true,
        };
      }

      const result = this._documentOperations.deleteDocument(allDocs[0]._id);

      if (result.deletedCount > 0) {
        this._updateMetadata({
          documentCount: Object.keys(this._documents).length,
        });
        this._markDirty();
      }

      return {
        deletedCount: result.deletedCount,
        acknowledged: true,
      };
    }

    // ID filter {_id: "id"} - use direct lookup for performance
    if (filterKeys.length === 1 && filterKeys[0] === "_id") {
      const result = this._documentOperations.deleteDocument(filter._id);

      if (result.deletedCount > 0) {
        this._updateMetadata({
          documentCount: Object.keys(this._documents).length,
        });
        this._markDirty();
      }

      return {
        deletedCount: result.deletedCount,
        acknowledged: true,
      };
    }

    // Field-based or complex queries - use QueryEngine
    const matchingDoc = this._documentOperations.findByQuery(filter);

    if (!matchingDoc) {
      return {
        deletedCount: 0,
        acknowledged: true,
      };
    }

    const result = this._documentOperations.deleteDocument(matchingDoc._id);

    if (result.deletedCount > 0) {
      this._updateMetadata({
        documentCount: Object.keys(this._documents).length,
      });
      this._markDirty();
    }

    return {
      deletedCount: result.deletedCount,
      acknowledged: true,
    };
  }

  /**
   * Count documents matching filter (MongoDB-compatible with QueryEngine support)
   * @param {Object} filter - Query filter (supports field-based queries and empty filter)
   * @returns {number} Count of matching documents
   * @throws {InvalidArgumentError} For invalid filters
   */
  countDocuments(filter = {}) {
    this._ensureLoaded();
    this._validateFilter(filter, "countDocuments");

    const filterKeys = Object.keys(filter);

    // Empty filter {} - count all documents
    if (filterKeys.length === 0) {
      return this._documentOperations.countDocuments();
    }

    // Field-based or complex queries - use QueryEngine
    return this._documentOperations.countByQuery(filter);
  }

  /**
   * Get collection name
   * @returns {string} Collection name
   */
  getName() {
    return this._name;
  }

  /**
   * Get collection metadata
   * @returns {Object} Metadata object
   */
  getMetadata() {
    this._ensureLoaded();
    return this._collectionMetadata;
  }

  /**
   * Check if collection has unsaved changes
   * @returns {boolean} True if dirty
   */
  isDirty() {
    return this._dirty;
  }

  /**
   * Force save collection to Drive
   * @throws {OperationError} If save fails
   */
  save() {
    if (this._loaded && this._dirty) {
      this._saveData();
    }
  }
}
