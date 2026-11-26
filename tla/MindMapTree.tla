---------------------------- MODULE MindMapTree ----------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS
  ROOT,
  NODE_IDS,
  COLORS,
  SIDES

VARIABLES
  nodes,
  parent,
  children,
  side,
  edgeColor,
  collapsed,
  layout

vars == <<nodes, parent, children, side, edgeColor, collapsed, layout>>

ParentStep(S) ==
  { parent[n] : n \in S } \cap nodes

AncestorsStep(n, k) ==
  LET RECURSIVE Helper(_, _)
      Helper(cur, rem) ==
        IF rem = 0 THEN cur
        ELSE Helper(cur \cup ParentStep(cur), rem - 1)
  IN Helper(ParentStep({n}), k)

Ancestors(n) == AncestorsStep(n, Cardinality(NODE_IDS))

Subtree(n) == { x \in nodes : x = n \/ n \in Ancestors(x) }

TypeOK ==
  /\ nodes \subseteq NODE_IDS
  /\ ROOT \in nodes
  /\ parent \in [NODE_IDS -> NODE_IDS \cup {"NONE"}]
  /\ children \in [NODE_IDS -> SUBSET NODE_IDS]
  /\ side \in [NODE_IDS -> SIDES \cup {"NONE"}]
  /\ edgeColor \in [NODE_IDS -> COLORS]
  /\ collapsed \subseteq nodes
  /\ layout \in {"horizontal", "vertical"}

Init ==
  /\ nodes = {ROOT}
  /\ parent = [n \in NODE_IDS |-> "NONE"]
  /\ children = [n \in NODE_IDS |-> {}]
  /\ side = [n \in NODE_IDS |-> "NONE"]
  /\ edgeColor = [n \in NODE_IDS |-> "blue"]
  /\ collapsed = {}
  /\ layout = "horizontal"

AddNode(newId, pId, inputSide, inputColor) ==
  /\ newId \in NODE_IDS
  /\ newId \notin nodes
  /\ pId \in nodes
  /\ inputSide \in SIDES
  /\ inputColor \in COLORS
  /\ LET resolvedSide == IF pId = ROOT THEN inputSide ELSE side[pId]
         resolvedColor == IF pId = ROOT THEN inputColor ELSE edgeColor[pId]
     IN
       /\ nodes' = nodes \cup {newId}
       /\ parent' = [parent EXCEPT ![newId] = pId]
       /\ children' = [children EXCEPT ![pId] = @ \cup {newId}, ![newId] = {}]
       /\ side' = [side EXCEPT ![newId] = resolvedSide]
       /\ edgeColor' = [edgeColor EXCEPT ![newId] = resolvedColor]
       /\ collapsed' = collapsed \ {pId}
       /\ UNCHANGED layout

MoveNode(target, newParent, inputSide) ==
  /\ target \in nodes
  /\ target # ROOT
  /\ newParent \in nodes
  /\ newParent # target
  /\ newParent \notin Subtree(target)
  /\ inputSide \in SIDES
  /\ LET oldParent == parent[target]
         sub == Subtree(target)
         resolvedSide == IF newParent = ROOT THEN inputSide ELSE side[newParent]
         resolvedColor == IF newParent = ROOT THEN edgeColor[target] ELSE edgeColor[newParent]
     IN
       /\ parent' = [parent EXCEPT ![target] = newParent]
       /\ children' =
            [n \in NODE_IDS |->
              LET step1 == IF n = oldParent THEN children[n] \ {target} ELSE children[n]
              IN IF n = newParent THEN step1 \cup {target} ELSE step1]
       /\ side' = [n \in NODE_IDS |-> IF n \in sub THEN resolvedSide ELSE side[n]]
       /\ edgeColor' = [n \in NODE_IDS |-> IF n \in sub THEN resolvedColor ELSE edgeColor[n]]
       /\ collapsed' = collapsed \ {newParent}
       /\ UNCHANGED <<nodes, layout>>

DeleteSubtree(target) ==
  /\ target \in nodes
  /\ target # ROOT
  /\ LET sub == Subtree(target)
         oldParent == parent[target]
     IN
       /\ nodes' = nodes \ sub
       /\ parent' = [n \in NODE_IDS |-> IF n \in sub THEN "NONE" ELSE parent[n]]
       /\ children' =
            [n \in NODE_IDS |->
              IF n \in sub THEN {}
              ELSE IF n = oldParent THEN children[n] \ {target}
              ELSE children[n]]
       /\ side' = [n \in NODE_IDS |-> IF n \in sub THEN "NONE" ELSE side[n]]
       /\ collapsed' = collapsed \ sub
       /\ UNCHANGED <<edgeColor, layout>>

SetEdgeColor(target, col) ==
  /\ target \in nodes
  /\ target # ROOT
  /\ col \in COLORS
  /\ LET sub == Subtree(target)
     IN edgeColor' = [n \in NODE_IDS |-> IF n \in sub THEN col ELSE edgeColor[n]]
  /\ UNCHANGED <<nodes, parent, children, side, collapsed, layout>>

ToggleCollapse(target) ==
  /\ target \in nodes
  /\ collapsed' = IF target \in collapsed THEN collapsed \ {target} ELSE collapsed \cup {target}
  /\ UNCHANGED <<nodes, parent, children, side, edgeColor, layout>>

ToggleLayout ==
  /\ layout' = IF layout = "horizontal" THEN "vertical" ELSE "horizontal"
  /\ UNCHANGED <<nodes, parent, children, side, edgeColor, collapsed>>

Next ==
  \/ \E nid \in NODE_IDS, pid \in NODE_IDS, s \in SIDES, c \in COLORS : AddNode(nid, pid, s, c)
  \/ \E t \in NODE_IDS, np \in NODE_IDS, s \in SIDES : MoveNode(t, np, s)
  \/ \E t \in NODE_IDS : DeleteSubtree(t)
  \/ \E t \in NODE_IDS, c \in COLORS : SetEdgeColor(t, c)
  \/ \E t \in NODE_IDS : ToggleCollapse(t)
  \/ ToggleLayout

Spec == Init /\ [][Next]_vars

RootProtected ==
  /\ ROOT \in nodes
  /\ parent[ROOT] = "NONE"
  /\ side[ROOT] = "NONE"

BidirectionalConsistency ==
  \A u \in nodes, v \in nodes :
    (v \in children[u]) <=> (parent[v] = u)

ChildrenClosedUnderNodes ==
  \A u \in nodes : children[u] \subseteq nodes

NoCycles ==
  \A n \in nodes : n \notin Ancestors(n)

EveryNonRootHasParent ==
  \A n \in nodes : n # ROOT => (parent[n] \in nodes /\ side[n] \in SIDES)

SubtreeSideConsistency ==
  \A n \in nodes : (parent[n] # "NONE" /\ parent[n] # ROOT) => side[n] = side[parent[n]]

SubtreeColorConsistency ==
  \A n \in nodes : (parent[n] # "NONE" /\ parent[n] # ROOT) => edgeColor[n] = edgeColor[parent[n]]

=============================================================================
