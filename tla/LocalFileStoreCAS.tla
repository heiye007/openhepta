------------------------- MODULE LocalFileStoreCAS -------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS
  REFS,
  HASHES

VARIABLES
  refToHash,
  blobExists,
  refCount

vars == <<refToHash, blobExists, refCount>>

TypeOK ==
  /\ refToHash \in [REFS -> HASHES \cup {"NONE"}]
  /\ blobExists \subseteq HASHES
  /\ refCount \in [HASHES -> 0..Cardinality(REFS)]

Init ==
  /\ refToHash = [r \in REFS |-> "NONE"]
  /\ blobExists = {}
  /\ refCount = [h \in HASHES |-> 0]

AddFile(r, h) ==
  /\ r \in REFS
  /\ h \in HASHES
  /\ refToHash[r] = "NONE"
  /\ refToHash' = [refToHash EXCEPT ![r] = h]
  /\ blobExists' = blobExists \cup {h}
  /\ refCount' = [refCount EXCEPT ![h] = @ + 1]

RemoveRef(r) ==
  /\ r \in REFS
  /\ refToHash[r] # "NONE"
  /\ LET h == refToHash[r]
         nextCount == refCount[h] - 1
     IN
       /\ refToHash' = [refToHash EXCEPT ![r] = "NONE"]
       /\ refCount' = [refCount EXCEPT ![h] = nextCount]
       /\ blobExists' = IF nextCount = 0 THEN blobExists \ {h} ELSE blobExists

Next ==
  \/ \E r \in REFS, h \in HASHES : AddFile(r, h)
  \/ \E r \in REFS : RemoveRef(r)

Spec == Init /\ [][Next]_vars

NoDanglingReferences ==
  \A r \in REFS : refToHash[r] # "NONE" => refToHash[r] \in blobExists

RefCountExact ==
  \A h \in HASHES :
    refCount[h] = Cardinality({ r \in REFS : refToHash[r] = h })

NoOrphanBlobs ==
  \A h \in HASHES : (h \in blobExists) <=> (refCount[h] > 0)

=============================================================================
